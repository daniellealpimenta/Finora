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

    connection: Mapped[Connection | None] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


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
