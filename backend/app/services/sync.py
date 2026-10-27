"""Sincronização Pluggy -> banco local.

Por conexão (item da Pluggy):
  1. Atualiza status/instituição do item
  2. Upsert das contas (saldo, limite, vencimento da fatura)
     Cartões: também as faturas fechadas (GET /bills)
  3. Upsert dos investimentos (caixinhas, cofrinhos): o que a Pluggy não devolve mais sai
  4. Busca as transações da janela [date_from, ∞) e faz upsert por (conta, id externo)
  5. Remove transações locais da janela que a Pluggy não retornou mais
     (a Pluggy apaga e recria transações quando data/valor/descrição mudam muito)
Ao final, `link_transfers` reclassifica os pares (fatura paga x pagamento no cartão).

Janela: 12 meses no primeiro sync; depois, desde o último sync menos 30 dias
(para pegar PENDING -> POSTED e correções feitas pelo banco).
"""

import logging
import threading
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import (
    Account,
    AccountType,
    AppSetting,
    CardBill,
    Category,
    CategoryKind,
    Connection,
    Investment,
    SavingsPot,
    Transaction,
    TransactionSource,
    TransactionStatus,
)
from app.integrations.pluggy.client import PluggyAccessError, PluggyClient, PluggyError
from app.services import yields
from app.services.cards import short_bank_name
from app.services.categories import Categorizer, ensure_categories, link_transfers

logger = logging.getLogger(__name__)

FIRST_SYNC_DAYS = 365
RESYNC_OVERLAP_DAYS = 30
# Brasil sem horário de verão desde 2019: datas da Pluggy vêm em UTC (00:00 BRT = 03:00Z)
BRT = timezone(timedelta(hours=-3))

_ACCOUNT_TYPES = {
    "CHECKING_ACCOUNT": AccountType.CHECKING,
    "SAVINGS_ACCOUNT": AccountType.SAVINGS,
    "CREDIT_CARD": AccountType.CREDIT_CARD,
}


@dataclass
class SyncResult:
    connections: int = 0
    accounts: int = 0
    investments: int = 0
    created: int = 0
    updated: int = 0
    deleted: int = 0
    errors: list[str] = field(default_factory=list)


# --- normalização -----------------------------------------------------------


def signed_amount(tx: dict[str, Any]) -> Decimal:
    """Saída negativa, entrada positiva, para qualquer tipo de conta.

    A Pluggy normaliza `type` (compra no cartão = DEBIT, pagamento da fatura = CREDIT),
    mas o sinal de `amount` varia entre conta e cartão; por isso usamos `type`.
    """
    value = abs(Decimal(str(tx["amount"])))
    return -value if tx["type"] == "DEBIT" else value


_CARD_PAYMENT_PREFIX = "0510"  # categoryId da Pluggy para "Pagamento de cartão de crédito"


def _is_card_payment(tx: dict[str, Any]) -> bool:
    return (tx.get("categoryId") or "").startswith(_CARD_PAYMENT_PREFIX)


def card_convention_inverted(txs: list[dict[str, Any]]) -> bool:
    """Detecta cartão com `type` invertido (compras chegando como CREDIT).

    A documentação diz que compras no cartão vêm como DEBIT, mas o sandbox da Pluggy
    (e possivelmente alguns conectores) manda o contrário. Compras são a grande maioria
    das transações de um cartão, então se a maioria (fora pagamentos de fatura) vier
    como CREDIT, a convenção está invertida.
    """
    purchases_like = [t for t in txs if not _is_card_payment(t)]
    if len(purchases_like) < 3:
        return False
    credits = sum(1 for t in purchases_like if t["type"] == "CREDIT")
    return credits > len(purchases_like) / 2


def card_signed_amount(tx: dict[str, Any], inverted: bool) -> Decimal:
    value = abs(Decimal(str(tx["amount"])))
    if _is_card_payment(tx):
        return value  # pagamento da fatura sempre reduz a dívida do cartão
    amount = signed_amount(tx)
    return -amount if inverted else amount


def local_date(value: str) -> date:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.date()
    return dt.astimezone(BRT).date()


def _merchant_name(tx: dict[str, Any]) -> str | None:
    merchant = tx.get("merchant") or {}
    return merchant.get("businessName") or merchant.get("name")


def _trimmed_raw(tx: dict[str, Any]) -> dict[str, Any]:
    # Guarda só o útil para análise; paymentData traz CPF/conta de terceiros
    # Moeda: compra no exterior vira alerta por e-mail (app/services/notify/rules.py)
    keys = (
        "category",
        "categoryId",
        "operationType",
        "creditCardMetadata",
        "merchant",
        "currencyCode",
        "amountInAccountCurrency",
    )
    return {k: tx[k] for k in keys if tx.get(k) is not None}


# --- sync -------------------------------------------------------------------


def _upsert_account(db: Session, connection: Connection, data: dict[str, Any]) -> Account:
    account = db.scalar(select(Account).where(Account.external_id == data["id"]))
    if account is None:
        account = Account(external_id=data["id"], connection=connection)
        db.add(account)
    account.connection = connection
    account.name = data.get("marketingName") or data.get("name") or "Conta"
    account.type = _ACCOUNT_TYPES.get(data.get("subtype") or "", AccountType.OTHER)
    account.currency = data.get("currencyCode") or "BRL"
    balance = Decimal(str(data.get("balance") or 0))
    credit = data.get("creditData") or {}
    if account.type == AccountType.CREDIT_CARD:
        # Saldo do cartão = valor devido; guardamos negativo (dívida)
        account.balance = -abs(balance)
        limit = credit.get("creditLimit")
        account.credit_limit = Decimal(str(limit)) if limit is not None else None
        account.bill_due_date = _optional_date(credit.get("balanceDueDate"))
        account.bill_close_date = _optional_date(credit.get("balanceCloseDate"))
        account.card_brand = credit.get("brand")
        account.card_level = credit.get("level")
        account.card_number = (data.get("number") or "")[-4:] or None
        account.available_credit_limit = _optional_decimal(
            credit.get("availableCreditLimit"), cents=True
        )
        account.installments_limit_used = _installments_used(credit)
    else:
        account.balance = balance
    return account


def _installments_used(credit: dict[str, Any]) -> Decimal | None:
    """Quanto do limite está em parcelas futuras (linha CREDITO_PARCELADO do Open Finance)."""
    for line in credit.get("disaggregatedCreditLimits") or []:
        if line.get("lineName") == "CREDITO_PARCELADO" and line.get("usedAmount") is not None:
            return _optional_decimal(line["usedAmount"], cents=True)
    return None


def _sync_bills(db: Session, pluggy: PluggyClient, account: Account) -> None:
    """Upsert das faturas fechadas do cartão. Se a Pluggy recusar, mantém as que já havia."""
    try:
        fetched = pluggy.list_bills(account.external_id)
    except PluggyError as exc:
        logger.warning("Faturas indisponíveis para a conta %s: %s", account.id, exc)
        return
    existing = {b.external_id: b for b in account.bills}
    for data in fetched:
        bill = existing.get(data["id"])
        if bill is None:
            bill = CardBill(external_id=data["id"], account=account)
            db.add(bill)
        # Data pura em 00:00Z: converter para BRT voltaria um dia
        bill.due_date = date.fromisoformat(data["dueDate"][:10])
        bill.total_amount = _optional_decimal(data.get("totalAmount") or 0, cents=True)
        bill.minimum_payment = _optional_decimal(data.get("minimumPaymentAmount"), cents=True)


def _optional_date(value: str | None) -> date | None:
    return local_date(value) if value else None


def _optional_decimal(value: Any, cents: bool = False) -> Decimal | None:
    if value is None:
        return None
    number = Decimal(str(value))
    return number.quantize(Decimal("0.01")) if cents else number


def _suggested_pot(db: Session, data: dict[str, Any]) -> SavingsPot:
    """Cofrinho sugerido para uma aplicação nova: mesmo emissor, produto e taxa.

    O Open Finance não traz o nome que o usuário deu ao cofrinho no app do banco, e cada
    depósito chega como uma aplicação separada. A taxa é o que melhor distingue um
    cofrinho do outro; o usuário renomeia, junta ou separa depois.
    """
    issuer = (data.get("issuer") or "").strip()
    subtype = data.get("subtype") or data.get("type") or "Investimento"
    rate, rate_type = data.get("rate"), data.get("rateType")
    key = f"{issuer}|{subtype}|{rate}|{rate_type}"[:160]
    pot = db.scalar(select(SavingsPot).where(SavingsPot.auto_key == key))
    if pot is None:
        who = short_bank_name(issuer) if issuer else "Cofrinho"
        rate_text = (
            f" {Decimal(str(rate)).normalize():f}% do {rate_type}" if rate and rate_type else ""
        )
        pot = SavingsPot(name=f"{who} {subtype}{rate_text}"[:100], auto_key=key)
        db.add(pot)
        db.flush()
    return pot


# Resgatado por inteiro: some do app (o saldo é zero e não volta)
_CLOSED_INVESTMENT = "TOTAL_WITHDRAWAL"


def _sync_investments(
    db: Session, pluggy: PluggyClient, connection: Connection, result: SyncResult
) -> None:
    """Upsert dos investimentos do item. Se a Pluggy recusar (conector sem o produto
    INVESTMENTS, por exemplo), mantém o que já havia e segue com as transações."""
    try:
        fetched = pluggy.list_investments(connection.external_id)
    except PluggyError as exc:
        logger.warning("Investimentos indisponíveis para a conexão %s: %s", connection.id, exc)
        return

    existing = {i.external_id: i for i in connection.investments}
    seen: set[str] = set()
    for data in fetched:
        if data.get("status") == _CLOSED_INVESTMENT:
            continue
        seen.add(data["id"])
        item = existing.get(data["id"])
        is_new = item is None
        if is_new:
            item = Investment(external_id=data["id"], connection=connection)
            db.add(item)
        item.name = (data.get("name") or "Investimento")[:255]
        item.type = data.get("type") or "OTHER"
        item.subtype = data.get("subtype")
        item.balance = Decimal(str(data.get("balance") or 0))
        item.currency = data.get("currencyCode") or "BRL"
        item.status = data.get("status")
        item.rate = _optional_decimal(data.get("rate"))
        item.rate_type = data.get("rateType")
        item.amount_original = _optional_decimal(data.get("amountOriginal"), cents=True)
        item.purchase_date = _optional_date(data.get("purchaseDate"))
        item.due_date = _optional_date(data.get("dueDate"))
        if is_new:
            item.pot = _suggested_pot(db, data)
        result.investments += 1
    for external_id, item in existing.items():
        if external_id not in seen:
            db.delete(item)


def _sync_transactions(
    db: Session,
    pluggy: PluggyClient,
    account: Account,
    date_from: date,
    categorizer: Categorizer,
    kinds: dict[int, CategoryKind],
    result: SyncResult,
) -> None:
    existing = {
        t.external_id: t
        for t in db.scalars(
            select(Transaction).where(
                Transaction.account_id == account.id,
                Transaction.source == TransactionSource.PLUGGY,
                Transaction.date >= date_from,
            )
        )
    }
    seen: set[str] = set()
    fetched = list(pluggy.iter_transactions(account.external_id, date_from=date_from))
    is_card = account.type == AccountType.CREDIT_CARD
    inverted = is_card and card_convention_inverted(fetched)
    if inverted:
        logger.info("Cartão %s com convenção de sinal invertida; corrigindo", account.id)

    for tx in fetched:
        seen.add(tx["id"])
        row = existing.get(tx["id"])
        if row is None:
            # Pode existir fora da janela (data alterada para trás); busca direto
            row = db.scalar(
                select(Transaction).where(
                    Transaction.account_id == account.id, Transaction.external_id == tx["id"]
                )
            )
        if row is None:
            row = Transaction(
                account=account, external_id=tx["id"], source=TransactionSource.PLUGGY
            )
            db.add(row)
            result.created += 1
        else:
            result.updated += 1

        row.date = local_date(tx["date"])
        row.amount = card_signed_amount(tx, inverted) if is_card else signed_amount(tx)
        row.description = (tx.get("description") or tx.get("descriptionRaw") or "")[:512]
        row.merchant = _merchant_name(tx)
        row.provider_category = tx.get("category")
        row.provider_category_id = tx.get("categoryId")
        row.status = TransactionStatus(tx.get("status") or "POSTED")
        meta = tx.get("creditCardMetadata") or {}
        row.installment_number = meta.get("installmentNumber")
        row.installment_total = meta.get("totalInstallments")
        row.raw = _trimmed_raw(tx)
        if not row.user_categorized:
            row.category_id = categorizer.categorize(
                row.description, row.provider_category_id, row.amount, row.merchant
            )
        row.is_transfer = kinds.get(row.category_id) == CategoryKind.TRANSFER

    stale = [ext_id for ext_id in existing if ext_id not in seen]
    if stale:
        db.execute(
            delete(Transaction).where(
                Transaction.account_id == account.id, Transaction.external_id.in_(stale)
            )
        )
        result.deleted += len(stale)


def sync_connection(
    db: Session, pluggy: PluggyClient, connection: Connection, result: SyncResult
) -> None:
    started = datetime.now(UTC)
    item = pluggy.get_item(connection.external_id)
    connector = item.get("connector") or {}
    connection.institution_name = connector.get("name") or connection.institution_name
    connection.institution_logo_url = connector.get("imageUrl")
    connection.status = item.get("status") or connection.status

    if connection.last_synced_at:
        date_from = connection.last_synced_at.date() - timedelta(days=RESYNC_OVERLAP_DAYS)
    else:
        date_from = started.date() - timedelta(days=FIRST_SYNC_DAYS)

    categorizer = Categorizer(db)
    kinds = {c.id: c.kind for c in db.scalars(select(Category))}
    for data in pluggy.list_accounts(connection.external_id):
        account = _upsert_account(db, connection, data)
        db.flush()
        _sync_transactions(db, pluggy, account, date_from, categorizer, kinds, result)
        if account.type == AccountType.CREDIT_CARD:
            _sync_bills(db, pluggy, account)
        result.accounts += 1
    _sync_investments(db, pluggy, connection, result)

    connection.last_synced_at = started
    connection.last_sync_error = None
    result.connections += 1


def sync_all(db: Session, connection_ids: list[int] | None = None) -> SyncResult:
    ensure_categories(db)
    result = SyncResult()
    query = select(Connection)
    if connection_ids:
        query = query.where(Connection.id.in_(connection_ids))
    connections = list(db.scalars(query))
    if not connections:
        return result

    try:
        with PluggyClient() as pluggy:
            _sync_connections(db, pluggy, connections, result)
    except PluggyAccessError as exc:
        db.rollback()
        logger.warning("A Pluggy recusou o acesso: %s", exc)
        set_pluggy_alert(db, str(exc))
        result.errors.append(f"A Pluggy recusou o acesso: {exc}"[:1024])
        return result
    clear_pluggy_alert(db)
    # Pares (fatura paga na conta x pagamento no cartão) podem cruzar conexões
    link_transfers(db)
    # Saldo do dia de cada aplicação: é a diferença entre dias que mostra o rendimento diário
    yields.record_snapshots(db, date.today())
    db.commit()
    return result


def _sync_connections(
    db: Session, pluggy: PluggyClient, connections: list[Connection], result: SyncResult
) -> None:
    for connection in connections:
        try:
            sync_connection(db, pluggy, connection, result)
            db.commit()
        except PluggyAccessError:
            raise  # vale para todas: sync_all para e avisa
        except Exception as exc:  # uma conexão com erro não derruba as outras
            db.rollback()
            logger.exception("Falha ao sincronizar conexão %s", connection.id)
            message = f"{connection.institution_name}: {exc}"[:1024]
            connection.last_sync_error = message
            db.commit()
            result.errors.append(message)


# --- acesso recusado pela Pluggy ---------------------------------------------
# Fica gravado (sobrevive a fechar o app) até um sync dar certo ou a chave ser trocada.
# Pelo README do Meu Pluggy, o fim do teste (15 dias) não corta os dados; isto cobre aplicação
# apagada, chave trocada ou mudança da Pluggy. O texto dela fica em `detail` para diagnóstico.

ALERT_KEY = "pluggy_alert"


def get_pluggy_alert(db: Session) -> dict | None:
    setting = db.get(AppSetting, ALERT_KEY)
    return setting.value if setting else None


def set_pluggy_alert(db: Session, detail: str) -> None:
    setting = db.get(AppSetting, ALERT_KEY)
    if setting is None:
        since = datetime.now(UTC).isoformat()
        db.add(AppSetting(key=ALERT_KEY, value={"since": since, "detail": detail[:1024]}))
    else:
        # Mantém a data da primeira recusa
        setting.value = {**setting.value, "detail": detail[:1024]}
    db.commit()


def clear_pluggy_alert(db: Session) -> None:
    setting = db.get(AppSetting, ALERT_KEY)
    if setting is not None:
        db.delete(setting)
        db.commit()


# --- estado e execução em segundo plano -------------------------------------


@dataclass
class SyncState:
    running: bool = False
    last_started_at: datetime | None = None
    last_finished_at: datetime | None = None
    last_result: SyncResult | None = None
    last_error: str | None = None


state = SyncState()
_lock = threading.Lock()


def run_sync(session_factory, connection_ids: list[int] | None = None) -> bool:
    """Executa o sync se nenhum outro estiver rodando. Retorna False se já havia um."""
    if not _lock.acquire(blocking=False):
        return False
    state.running = True
    state.last_started_at = datetime.now(UTC)
    try:
        with session_factory() as db:
            state.last_result = sync_all(db, connection_ids)
            state.last_error = None
    except Exception as exc:
        logger.exception("Sync falhou")
        state.last_error = str(exc)
    finally:
        state.running = False
        state.last_finished_at = datetime.now(UTC)
        _lock.release()
    return True
