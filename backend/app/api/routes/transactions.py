from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.api.deps import CurrentUser, DbSession
from app.db.models import (
    Account,
    Category,
    CategoryKind,
    CategoryRule,
    Transaction,
    TransactionStatus,
)
from app.services import analytics
from app.services.categories import ensure_categories

router = APIRouter(tags=["transações"])


class CategoryOut(BaseModel):
    id: int
    key: str | None
    name: str
    kind: CategoryKind

    model_config = {"from_attributes": True}


class TransactionOut(BaseModel):
    id: int
    date: date
    amount: Decimal
    description: str
    merchant: str | None
    account_id: int
    account_name: str
    category_id: int | None
    category_name: str | None
    category_kind: CategoryKind | None
    status: TransactionStatus
    installment_number: int | None
    installment_total: int | None
    user_categorized: bool


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    income: Decimal
    expense: Decimal


class TransactionUpdate(BaseModel):
    category_id: int
    # Cria regra "descrição contém <padrão> -> categoria" e aplica nas demais
    create_rule: bool = False
    rule_pattern: str | None = Field(default=None, max_length=255)


class RuleOut(BaseModel):
    id: int
    pattern: str
    category_id: int
    category_name: str


def _to_out(t: Transaction) -> TransactionOut:
    return TransactionOut(
        id=t.id,
        date=t.date,
        amount=t.amount,
        description=t.description,
        merchant=t.merchant,
        account_id=t.account_id,
        account_name=t.account.name,
        category_id=t.category_id,
        category_name=t.category.name if t.category else None,
        category_kind=t.category.kind if t.category else None,
        status=t.status,
        installment_number=t.installment_number,
        installment_total=t.installment_total,
        user_categorized=t.user_categorized,
    )


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(_: CurrentUser, db: DbSession) -> list[Category]:
    ensure_categories(db)
    return list(db.scalars(select(Category).order_by(Category.kind, Category.name)))


Month = Query(default=None, pattern=r"^\d{4}-\d{2}$")


def _filters(
    db: DbSession, month: str | None, account_id: int | None, category_id: int | None, q: str | None
) -> list:
    filters = []
    if month:
        # Ciclo da fatura: compras no cartão vão para o ciclo em que a fatura delas fecha
        filters.append(Transaction.id.in_(analytics.transaction_ids_in_cycle(db, month)))
    if account_id:
        filters.append(Transaction.account_id == account_id)
    if category_id:
        filters.append(Transaction.category_id == category_id)
    if q:
        like = f"%{q}%"
        filters.append(or_(Transaction.description.ilike(like), Transaction.merchant.ilike(like)))
    return filters


class CategorySpend(BaseModel):
    category_id: int | None
    category_name: str
    # Gasto líquido (estornos abatem), positivo; float para o front somar direto
    spent: float
    count: int


@router.get("/transactions/by-category", response_model=list[CategorySpend])
def spend_by_category(
    _: CurrentUser,
    db: DbSession,
    month: str | None = Month,
    account_id: int | None = None,
    q: str | None = None,
) -> list[CategorySpend]:
    """Gasto por categoria com os mesmos filtros da lista (ciclo ou todos, conta, busca): os
    cards de categoria da tela de transações. Sem filtro de categoria, para os cards ficarem."""
    expense = or_(
        Category.kind == CategoryKind.EXPENSE,
        (Category.kind.is_(None)) & (Transaction.amount < 0),
    )
    rows = db.execute(
        select(
            Transaction.category_id,
            func.coalesce(Category.name, "Sem categoria"),
            -func.sum(Transaction.amount),
            func.count(Transaction.id),
        )
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(*_filters(db, month, account_id, None, q), expense)
        .group_by(Transaction.category_id, Category.name)
    )
    out = [
        CategorySpend(category_id=cid, category_name=name, spent=float(spent), count=count)
        for cid, name, spent, count in rows
        if spent and spent > 0
    ]
    return sorted(out, key=lambda c: c.spent, reverse=True)


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    _: CurrentUser,
    db: DbSession,
    month: str | None = Month,
    account_id: int | None = None,
    category_id: int | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> TransactionPage:
    filters = _filters(db, month, account_id, category_id, q)

    total = db.scalar(select(func.count(Transaction.id)).where(*filters)) or 0
    sums = db.execute(
        select(
            func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount > 0), 0),
            func.coalesce(func.sum(Transaction.amount).filter(Transaction.amount < 0), 0),
        )
        .join(Category, Transaction.category_id == Category.id, isouter=True)
        .where(*filters, or_(Category.kind.is_(None), Category.kind != CategoryKind.TRANSFER))
    ).one()
    rows = db.scalars(
        select(Transaction)
        .join(Account)
        .where(*filters)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return TransactionPage(
        items=[_to_out(t) for t in rows],
        total=total,
        income=Decimal(str(sums[0])),
        expense=Decimal(str(sums[1])),
    )


@router.patch("/transactions/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int, body: TransactionUpdate, _: CurrentUser, db: DbSession
) -> TransactionOut:
    tx = db.get(Transaction, transaction_id)
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transação não encontrada")
    category = db.get(Category, body.category_id)
    if category is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Categoria inválida")

    tx.category_id = category.id
    tx.is_transfer = category.kind == CategoryKind.TRANSFER
    tx.user_categorized = True

    if body.create_rule:
        pattern = (body.rule_pattern or tx.merchant or tx.description).strip()
        if not pattern:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Padrão da regra vazio")
        db.add(CategoryRule(pattern=pattern, category_id=category.id))
        # Aplica a regra nas transações que não foram categorizadas manualmente.
        # Comparação em Python: o LOWER() do SQLite ignora acentos (SÃO != são).
        needle = pattern.casefold()
        for other in db.scalars(select(Transaction).where(Transaction.user_categorized.is_(False))):
            texts = (other.description.casefold(), (other.merchant or "").casefold())
            if any(needle in text for text in texts):
                other.category_id = category.id
                other.is_transfer = tx.is_transfer

    db.commit()
    db.refresh(tx)
    return _to_out(tx)


@router.get("/rules", response_model=list[RuleOut])
def list_rules(_: CurrentUser, db: DbSession) -> list[RuleOut]:
    rows = db.execute(
        select(CategoryRule, Category.name)
        .join(Category, CategoryRule.category_id == Category.id)
        .order_by(CategoryRule.id.desc())
    )
    return [
        RuleOut(id=r.id, pattern=r.pattern, category_id=r.category_id, category_name=name)
        for r, name in rows
    ]


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, _: CurrentUser, db: DbSession) -> None:
    rule = db.get(CategoryRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regra não encontrada")
    db.delete(rule)
    db.commit()
