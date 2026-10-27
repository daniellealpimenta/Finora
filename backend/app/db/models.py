import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

Money = Numeric(14, 2)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    # Opcional: entra no login no lugar do e-mail. Sempre minúsculo (ver app/core/usernames.py)
    username: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    totp_secret: Mapped[str | None] = mapped_column(String(255))  # criptografado (Fernet)


class ConnectionStatus(enum.StrEnum):
    UPDATED = "UPDATED"
    UPDATING = "UPDATING"
    LOGIN_ERROR = "LOGIN_ERROR"
    OUTDATED = "OUTDATED"
    WAITING_USER_INPUT = "WAITING_USER_INPUT"


class Connection(TimestampMixin, Base):
    """Um 'item' da Pluggy: o vínculo com uma instituição financeira."""

    __tablename__ = "connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), default="pluggy")
    # Item id da Pluggy. Não é segredo: sem o CLIENT_SECRET ele não dá acesso a nada.
    external_id: Mapped[str] = mapped_column(String(64), unique=True)
    institution_name: Mapped[str] = mapped_column(String(255))
    institution_logo_url: Mapped[str | None] = mapped_column(String(512))
    last_sync_error: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32), default=ConnectionStatus.UPDATED)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    accounts: Mapped[list["Account"]] = relationship(
        back_populates="connection", cascade="all, delete-orphan"
    )
    investments: Mapped[list["Investment"]] = relationship(
        back_populates="connection", cascade="all, delete-orphan"
    )


class AccountType(enum.StrEnum):
    CHECKING = "CHECKING"
    SAVINGS = "SAVINGS"
    CREDIT_CARD = "CREDIT_CARD"
    INVESTMENT = "INVESTMENT"
    LOAN = "LOAN"
    OTHER = "OTHER"


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    connection_id: Mapped[int | None] = mapped_column(ForeignKey("connections.id"))
    external_id: Mapped[str | None] = mapped_column(String(128), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[AccountType] = mapped_column(Enum(AccountType, native_enum=False, length=32))
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    balance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    credit_limit: Mapped[Decimal | None] = mapped_column(Money)
    # Cartão: vencimento e fechamento da fatura atual (creditData da Pluggy)
    bill_due_date: Mapped[date | None] = mapped_column(Date)
    bill_close_date: Mapped[date | None] = mapped_column(Date)
    # Cartão: bandeira, categoria, final do número e quanto do limite ainda está livre
    card_brand: Mapped[str | None] = mapped_column(String(32))  # MASTERCARD, VISA...
    card_level: Mapped[str | None] = mapped_column(String(32))  # GOLD, PLATINUM...
    card_number: Mapped[str | None] = mapped_column(String(8))  # últimos dígitos
    available_credit_limit: Mapped[Decimal | None] = mapped_column(Money)
    # Parte do limite presa em parcelas que ainda vão entrar nas próximas faturas
    installments_limit_used: Mapped[Decimal | None] = mapped_column(Money)
    # Dia de fechamento escolhido pelo usuário (a Pluggy não informa; sem ele, é estimado)
    closing_day: Mapped[int | None] = mapped_column(Integer)

    connection: Mapped[Connection | None] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    bills: Mapped[list["CardBill"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class CardBill(Base):
    """Fatura fechada de um cartão (GET /bills da Pluggy). A fatura aberta não vem daqui:
    é a soma das compras do cartão que ainda não têm `billId`."""

    __tablename__ = "card_bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(128), unique=True)
    due_date: Mapped[date] = mapped_column(Date)
    total_amount: Mapped[Decimal] = mapped_column(Money)
    minimum_payment: Mapped[Decimal | None] = mapped_column(Money)

    account: Mapped[Account] = relationship(back_populates="bills")


class Investment(TimestampMixin, Base):
    """Dinheiro guardado: caixinhas, cofrinhos, CDBs, fundos (GET /investments da Pluggy)."""

    __tablename__ = "investments"

    id: Mapped[int] = mapped_column(primary_key=True)
    connection_id: Mapped[int] = mapped_column(ForeignKey("connections.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(128), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(32))  # FIXED_INCOME, MUTUAL_FUND, ...
    subtype: Mapped[str | None] = mapped_column(String(64))  # CDB, LCI, ...
    balance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    status: Mapped[str | None] = mapped_column(String(32))
    # Meta definida pelo usuário aqui (a Pluggy não tem esse dado); o sync nunca mexe nela
    goal_amount: Mapped[Decimal | None] = mapped_column(Money)
    # Detalhes da aplicação: é por eles que o usuário reconhece cada depósito
    rate: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))  # 110 = 110% do CDI
    rate_type: Mapped[str | None] = mapped_column(String(16))  # CDI, SELIC, IPCA, PRE...
    amount_original: Mapped[Decimal | None] = mapped_column(Money)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    # Cofrinho a que o usuário ligou esta aplicação (o Open Finance não traz o nome dele)
    pot_id: Mapped[int | None] = mapped_column(
        ForeignKey("savings_pots.id", ondelete="SET NULL"), index=True
    )

    connection: Mapped[Connection] = relationship(back_populates="investments")
    pot: Mapped["SavingsPot | None"] = relationship(back_populates="investments")
    snapshots: Mapped[list["InvestmentSnapshot"]] = relationship(
        back_populates="investment", cascade="all, delete-orphan", passive_deletes=True
    )


class InvestmentSnapshot(Base):
    """Saldo da aplicação num dia, gravado a cada sync: a Pluggy só manda o saldo de hoje, e
    é a diferença entre dias que mostra quanto rendeu em cada um."""

    __tablename__ = "investment_snapshots"
    __table_args__ = (UniqueConstraint("investment_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    investment_id: Mapped[int] = mapped_column(
        ForeignKey("investments.id", ondelete="CASCADE"), index=True
    )
    day: Mapped[date] = mapped_column(Date)
    balance: Mapped[Decimal] = mapped_column(Money)
    # Aplicado naquele dia: separa rendimento de depósito novo
    amount_original: Mapped[Decimal | None] = mapped_column(Money)

    investment: Mapped[Investment] = relationship(back_populates="snapshots")


class SavingsPot(TimestampMixin, Base):
    """Cofrinho montado pelo usuário: junta aplicações (cada depósito no PicPay, por
    exemplo, vira um CDB separado na Pluggy, todos com o mesmo nome)."""

    __tablename__ = "savings_pots"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    goal_amount: Mapped[Decimal | None] = mapped_column(Money)
    # Chave de agrupamento automático (instituição + produto + taxa) do cofrinho sugerido;
    # aplicações novas com a mesma chave entram nele sozinhas
    auto_key: Mapped[str | None] = mapped_column(String(160), unique=True)

    investments: Mapped[list[Investment]] = relationship(back_populates="pot")


class CategoryKind(enum.StrEnum):
    EXPENSE = "EXPENSE"
    INCOME = "INCOME"
    TRANSFER = "TRANSFER"


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Identificador estável (ex.: "groceries") usado pelo mapeamento da Pluggy e pelos seeds
    key: Mapped[str | None] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[CategoryKind] = mapped_column(Enum(CategoryKind, native_enum=False, length=16))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    color: Mapped[str | None] = mapped_column(String(16))

    __table_args__ = (UniqueConstraint("name", "parent_id"),)


class CategoryRule(TimestampMixin, Base):
    """Regra 'descrição contém padrão -> categoria', criada a partir de correções do usuário."""

    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    pattern: Mapped[str] = mapped_column(String(255))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    priority: Mapped[int] = mapped_column(Integer, default=0)


class TransactionStatus(enum.StrEnum):
    POSTED = "POSTED"
    PENDING = "PENDING"  # ainda não liquidada (fatura aberta, parcela futura, agendamento)


class TransactionSource(enum.StrEnum):
    PLUGGY = "PLUGGY"
    OFX = "OFX"
    CSV = "CSV"
    MANUAL = "MANUAL"


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    # Chave de deduplicação: id do provedor ou hash (data+valor+descrição) para importações
    external_id: Mapped[str] = mapped_column(String(128))
    source: Mapped[TransactionSource] = mapped_column(
        Enum(TransactionSource, native_enum=False, length=16)
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    # Negativo = saída, positivo = entrada (normalizado entre provedores)
    amount: Mapped[Decimal] = mapped_column(Money)
    description: Mapped[str] = mapped_column(String(512))
    merchant: Mapped[str | None] = mapped_column(String(255))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), index=True)
    provider_category: Mapped[str | None] = mapped_column(String(128))
    provider_category_id: Mapped[str | None] = mapped_column(String(16))
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus, native_enum=False, length=16), default=TransactionStatus.POSTED
    )
    # Categoria escolhida manualmente: o sync nunca sobrescreve
    user_categorized: Mapped[bool] = mapped_column(Boolean, default=False)
    is_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    installment_number: Mapped[int | None] = mapped_column(Integer)
    installment_total: Mapped[int | None] = mapped_column(Integer)
    raw: Mapped[dict | None] = mapped_column(JSON)

    account: Mapped[Account] = relationship(back_populates="transactions")
    category: Mapped[Category | None] = relationship()

    __table_args__ = (UniqueConstraint("account_id", "external_id"),)


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    month: Mapped[date] = mapped_column(Date)  # sempre o dia 1 do mês
    limit_amount: Mapped[Decimal] = mapped_column(Money)

    __table_args__ = (UniqueConstraint("category_id", "month"),)


class AppSetting(Base):
    """Preferências do usuário guardadas como JSON por chave (ex.: "planning": dízimo, meta do
    cofrinho e até quando cada entrada fixa conta na previsão)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class WishStatus(enum.StrEnum):
    WANTED = "WANTED"
    BOUGHT = "BOUGHT"
    DROPPED = "DROPPED"  # desisti


class WishGroup(TimestampMixin, Base):
    """Grupo da lista de desejos (ex.: "Casa nova"), com total próprio. Pode ser ligado a um
    cofrinho para acompanhar quanto já foi guardado para ele."""

    __tablename__ = "wish_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    pot_id: Mapped[int | None] = mapped_column(ForeignKey("savings_pots.id", ondelete="SET NULL"))

    pot: Mapped[SavingsPot | None] = relationship()
    items: Mapped[list["WishItem"]] = relationship(back_populates="group")


class WishItem(TimestampMixin, Base):
    __tablename__ = "wish_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("wish_groups.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str | None] = mapped_column(String(2048))
    price: Mapped[Decimal] = mapped_column(Money)
    store: Mapped[str | None] = mapped_column(String(100))
    image_url: Mapped[str | None] = mapped_column(String(2048))
    notes: Mapped[str | None] = mapped_column(String(1000))
    priority: Mapped[int] = mapped_column(Integer, default=2)  # 1 alta, 2 média, 3 baixa
    status: Mapped[WishStatus] = mapped_column(
        Enum(WishStatus, native_enum=False, length=16), default=WishStatus.WANTED
    )
    # Avisa quando o preço chega nele ou abaixo
    target_price: Mapped[Decimal | None] = mapped_column(Money)
    bought_at: Mapped[date | None] = mapped_column(Date)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    group: Mapped[WishGroup | None] = relationship(back_populates="items")
    prices: Mapped[list["WishPrice"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="WishPrice.checked_at"
    )


class WishPrice(Base):
    """Histórico de preço de um desejo: um registro por mudança de preço."""

    __tablename__ = "wish_prices"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("wish_items.id", ondelete="CASCADE"), index=True
    )
    price: Mapped[Decimal] = mapped_column(Money)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    item: Mapped[WishItem] = relationship(back_populates="prices")


class EmailLog(TimestampMixin, Base):
    """Avisos por e-mail já tratados. `key` identifica o aviso (ex.: "cycle_closed:2026-09",
    "unusual:812") e é única: o mesmo aviso nunca sai duas vezes. `status`: sent, error ou
    baseline (já existia quando os avisos foram ligados; marcado sem enviar, para não lotar a
    caixa de entrada com o passado)."""

    __tablename__ = "email_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    key: Mapped[str] = mapped_column(String(200), unique=True)
    subject: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(String(500))
