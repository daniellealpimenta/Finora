"""Catálogo de categorias do sistema e categorização automática.

Ordem de decisão para uma transação (a primeira que resolver vence):
  1. Escolha manual do usuário (`user_categorized`): nunca é sobrescrita
  2. Regras do usuário (`category_rules`): "descrição contém padrão"
  3. Regras embutidas por descrição (pagamento de fatura, aporte/resgate de cofrinho)
  4. Categoria da Pluggy (`categoryId`), traduzida pelo mapa abaixo
  5. Fallback: "Outros" (saída) ou "Outras receitas" (entrada)

Depois, `link_transfers` olha os pares de transações (saída numa conta, entrada em outra)
que a categoria de cada uma sozinha não revela.
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Account, AccountType, Category, CategoryKind, CategoryRule, Transaction

EXPENSE, INCOME, TRANSFER = CategoryKind.EXPENSE, CategoryKind.INCOME, CategoryKind.TRANSFER


@dataclass(frozen=True)
class CategoryDef:
    key: str
    name: str
    kind: CategoryKind


CATALOG: list[CategoryDef] = [
    # Receitas
    CategoryDef("salary", "Salário", INCOME),
    CategoryDef("extra_income", "Renda extra", INCOME),
    CategoryDef("investment_income", "Rendimentos", INCOME),
    CategoryDef("transfers_in", "Transferências recebidas", INCOME),
    CategoryDef("other_income", "Outras receitas", INCOME),
    # Movimentações que não são gasto nem receita
    CategoryDef("own_transfer", "Transferência entre contas", TRANSFER),
    CategoryDef("card_payment", "Pagamento de fatura", TRANSFER),
    CategoryDef("investments", "Investimentos", TRANSFER),
    # Despesas
    CategoryDef("housing", "Moradia", EXPENSE),
    CategoryDef("utilities", "Contas da casa", EXPENSE),
    CategoryDef("groceries", "Supermercado", EXPENSE),
    CategoryDef("eating_out", "Restaurantes e bares", EXPENSE),
    CategoryDef("delivery", "Delivery", EXPENSE),
    CategoryDef("transport", "Transporte", EXPENSE),
    CategoryDef("ride_hailing", "Táxi e apps", EXPENSE),
    CategoryDef("fuel", "Combustível", EXPENSE),
    CategoryDef("vehicle", "Veículo", EXPENSE),
    CategoryDef("health", "Saúde", EXPENSE),
    CategoryDef("pharmacy", "Farmácia", EXPENSE),
    CategoryDef("fitness", "Academia e bem-estar", EXPENSE),
    CategoryDef("education", "Educação", EXPENSE),
    CategoryDef("telecom", "Internet e celular", EXPENSE),
    CategoryDef("subscriptions", "Assinaturas e streaming", EXPENSE),
    CategoryDef("shopping", "Compras", EXPENSE),
    CategoryDef("pets", "Pets", EXPENSE),
    CategoryDef("travel", "Viagens", EXPENSE),
    CategoryDef("leisure", "Lazer", EXPENSE),
    CategoryDef("gambling", "Apostas", EXPENSE),
    CategoryDef("taxes_fees", "Impostos e tarifas", EXPENSE),
    CategoryDef("debt", "Juros e empréstimos", EXPENSE),
    CategoryDef("insurance", "Seguros", EXPENSE),
    CategoryDef("donations", "Doações", EXPENSE),
    CategoryDef("transfers_out", "Pix e transferências enviadas", EXPENSE),
    CategoryDef("other", "Outros", EXPENSE),
]

# categoryId da Pluggy (GET /categories) -> chave do catálogo.
# Resolvido pelo prefixo mais longo: "19050001" casa antes de "190500" e de "19".
PLUGGY_PREFIX_MAP: dict[str, str] = {
    "0101": "salary",
    "0102": "extra_income",
    "0103": "extra_income",
    "0104": "extra_income",
    "0105": "extra_income",
    "01": "extra_income",
    "02": "debt",
    "0306": "investment_income",
    "03": "investments",
    "04": "own_transfer",
    "0510": "card_payment",
    "05": "transfers_out",
    "06": "other",
    "070100": "telecom",
    "070200": "education",
    "070300": "fitness",
    "070400": "leisure",
    "07": "other",
    "0803": "pets",
    "08": "shopping",
    "09": "subscriptions",
    "10": "groceries",
    "1102": "delivery",
    "11": "eating_out",
    "12": "travel",
    "13": "donations",
    "14": "gambling",
    "15": "taxes_fees",
    "16": "taxes_fees",
    "1701": "housing",
    "1702": "utilities",
    "1704": "taxes_fees",
    "17": "housing",
    "1802": "pharmacy",
    "18": "health",
    "1901": "ride_hailing",
    "19050001": "fuel",
    "1905": "vehicle",
    "19": "transport",
    "20": "insurance",
    "21": "leisure",
}

# A Pluggy manda o pagamento da fatura (lado da conta) como "Transfers" e o resgate do
# cofrinho como "rendimento"; a descrição do banco é mais confiável nesses casos.
BUILTIN_TEXT_RULES: list[tuple[str, str]] = [
    ("pagamento de fatura", "card_payment"),
    ("resgate", "investments"),
    ("aporte", "investments"),
]

# Categorias de saída que, numa entrada de dinheiro, viram outra coisa
_CREDIT_OVERRIDES = {"transfers_out": "transfers_in", "other": "other_income"}


def pluggy_category_key(category_id: str | None, is_credit: bool) -> str | None:
    if not category_id:
        return None
    for length in range(len(category_id), 1, -1):
        key = PLUGGY_PREFIX_MAP.get(category_id[:length])
        if key:
            return _CREDIT_OVERRIDES.get(key, key) if is_credit else key
    return None


def ensure_categories(db: Session) -> None:
    """Cria (idempotente) as categorias do catálogo. Não altera nomes editados."""
    existing = set(db.scalars(select(Category.key).where(Category.key.is_not(None))))
    for c in CATALOG:
        if c.key not in existing:
            db.add(Category(key=c.key, name=c.name, kind=c.kind))
    db.commit()


class Categorizer:
    """Carrega categorias e regras uma vez e categoriza muitas transações."""

    def __init__(self, db: Session) -> None:
        self.by_key = {c.key: c.id for c in db.scalars(select(Category)) if c.key}
        self.rules = [
            (r.pattern.casefold(), r.category_id)
            for r in db.scalars(
                select(CategoryRule).order_by(CategoryRule.priority.desc(), CategoryRule.id.desc())
            )
        ]

    def categorize(
        self,
        description: str,
        provider_category_id: str | None,
        amount,
        merchant: str | None = None,
    ) -> int | None:
        # Regras comparam descrição e estabelecimento (como em PATCH /transactions)
        texts = [description.casefold(), (merchant or "").casefold()]
        for pattern, category_id in self.rules:
            if pattern and any(pattern in text for text in texts):
                return category_id
        for pattern, key in BUILTIN_TEXT_RULES:
            if pattern in texts[0] and key in self.by_key:
                return self.by_key[key]
        is_credit = amount > 0
        key = pluggy_category_key(provider_category_id, is_credit)
        if key is None:
            key = "other_income" if is_credit else "other"
        return self.by_key.get(key)


# --- pares de transações ------------------------------------------------------------

LIQUID_TYPES = (AccountType.CHECKING, AccountType.SAVINGS)
_CARD_PAYMENT_WINDOW = timedelta(days=3)
_SHARED_POT_WINDOW = timedelta(days=1)
_SHARED_POT_MARKER = "compartilhad"  # "Cofrinho Compartilhado"


def link_transfers(db: Session) -> int:
    """Reclassifica transações que só fazem sentido vistas em par. Retorna quantas mudaram.

    - Saída da conta com o mesmo valor de um pagamento recebido no cartão (até 3 dias de
      diferença) é o pagamento da fatura, não um Pix para terceiros. Sem isso, a fatura
      contaria como gasto junto com as compras do cartão.
    - Pix recebido no mesmo valor (e dia) de um aporte em cofrinho compartilhado é a parte
      de outra pessoa indo direto para o cofrinho: nem receita sua, nem dinheiro em conta.

    Escolhas manuais (`user_categorized`) nunca são alteradas.
    """
    by_key = {c.key: c for c in db.scalars(select(Category)) if c.key}
    needed = ("card_payment", "investments", "transfers_out", "other", "debt", "transfers_in")
    if any(k not in by_key for k in needed):
        return 0
    card_payment, investments = by_key["card_payment"], by_key["investments"]
    # Onde a fatura paga costuma cair: Pix/transferência, "outros" e, no débito automático
    # ("DÉB.CONV."), empréstimos
    loose_out = {by_key[k].id for k in ("transfers_out", "other", "debt")}

    rows = list(db.execute(select(Transaction, Account.type).join(Account)))
    liquid = [t for t, kind in rows if kind in LIQUID_TYPES]
    card_payments = sorted(
        (
            t
            for t, kind in rows
            if kind == AccountType.CREDIT_CARD and t.amount > 0 and t.category_id == card_payment.id
        ),
        key=lambda t: t.date,
    )
    changed = 0

    def relabel(t: Transaction, category: Category) -> None:
        nonlocal changed
        if t.category_id != category.id:
            t.category_id = category.id
            changed += 1
        t.is_transfer = True

    # Pagamentos de fatura: cada pagamento no cartão casa com no máximo uma saída
    candidates = [
        t
        for t in liquid
        if t.amount < 0
        and not t.user_categorized
        and t.category_id in loose_out | {card_payment.id}
    ]
    used: set[int] = set()
    for payment in card_payments:
        match = next(
            (
                t
                for t in sorted(candidates, key=lambda t: abs(t.date - payment.date))
                if t.id not in used
                and -t.amount == payment.amount
                and abs(t.date - payment.date) <= _CARD_PAYMENT_WINDOW
            ),
            None,
        )
        if match is not None:
            used.add(match.id)
            relabel(match, card_payment)

    # Contribuições de terceiros para o cofrinho compartilhado
    shared_aportes = [
        t
        for t in liquid
        if t.amount < 0
        and t.category_id == investments.id
        and _SHARED_POT_MARKER in t.description.casefold()
    ]
    incoming = [
        t
        for t in liquid
        if t.amount > 0
        and not t.user_categorized
        and t.category_id in (by_key["transfers_in"].id, investments.id)
    ]
    taken: set[int] = set()
    for aporte in shared_aportes:
        match = next(
            (
                t
                for t in incoming
                if t.id not in taken
                and t.account_id == aporte.account_id
                and t.amount == -aporte.amount
                and abs(t.date - aporte.date) <= _SHARED_POT_WINDOW
            ),
            None,
        )
        if match is not None:
            taken.add(match.id)
            relabel(match, investments)
    return changed


def recategorize_all(db: Session) -> int:
    """Reaplica a categorização automática (regras atuais) e os pares a todo o histórico.

    Usado na inicialização e depois de cada sync, para correções de regra valerem também
    para transações antigas. Não mexe nas escolhas manuais.
    """
    ensure_categories(db)
    categorizer = Categorizer(db)
    kinds = {c.id: c.kind for c in db.scalars(select(Category))}
    automatic = list(db.scalars(select(Transaction).where(Transaction.user_categorized.is_(False))))
    before = {t.id: t.category_id for t in automatic}
    for t in automatic:
        t.category_id = categorizer.categorize(
            t.description, t.provider_category_id, t.amount, t.merchant
        )
        t.is_transfer = kinds.get(t.category_id) == CategoryKind.TRANSFER
    link_transfers(db)
    db.commit()
    return sum(1 for t in automatic if t.category_id != before[t.id])
