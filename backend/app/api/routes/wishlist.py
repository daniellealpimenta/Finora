"""Lista de desejos: produtos (com link, preço e histórico) e grupos com total próprio."""

from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.api.numbers import plain
from app.db.models import SavingsPot, WishGroup, WishItem, WishPrice, WishStatus
from app.services import affordability
from app.services import wishlist as wish_service

router = APIRouter(tags=["desejos"])

ZERO = Decimal("0")


class PricePoint(BaseModel):
    price: Decimal
    checked_at: datetime


class ItemOut(BaseModel):
    id: int
    group_id: int | None
    name: str
    url: str | None
    price: Decimal
    store: str | None
    image_url: str | None
    notes: str | None
    priority: int
    status: WishStatus
    target_price: Decimal | None
    bought_at: date | None
    last_checked_at: datetime | None
    # Primeiro preço registrado: para mostrar quanto caiu ou subiu desde que foi adicionado
    first_price: Decimal
    lowest_price: Decimal
    # O pote do desejo: quanto já foi separado para ele
    saved: Decimal
    created_at: datetime


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(ge=0)
    url: str | None = Field(default=None, max_length=2048)
    group_id: int | None = None
    store: str | None = Field(default=None, max_length=100)
    image_url: str | None = Field(default=None, max_length=2048)
    notes: str | None = Field(default=None, max_length=1000)
    priority: int = Field(default=2, ge=1, le=3)
    target_price: Decimal | None = Field(default=None, ge=0)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    price: Decimal | None = Field(default=None, ge=0)
    url: str | None = Field(default=None, max_length=2048)
    group_id: int | None = None
    store: str | None = Field(default=None, max_length=100)
    image_url: str | None = Field(default=None, max_length=2048)
    notes: str | None = Field(default=None, max_length=1000)
    priority: int | None = Field(default=None, ge=1, le=3)
    status: WishStatus | None = None
    target_price: Decimal | None = Field(default=None, ge=0)


class JarIn(BaseModel):
    # Moedas jogadas no pote (negativo tira); o pote nunca fica abaixo de zero
    amount: Decimal = Field(ge=-1_000_000, le=1_000_000)


class GroupOut(BaseModel):
    id: int
    name: str
    pot_id: int | None
    pot_name: str | None
    # Saldo do cofrinho ligado: quanto já foi guardado para o grupo
    pot_balance: Decimal | None
    total: Decimal
    count: int


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    pot_id: int | None = None


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    pot_id: int | None = None


class WishlistOut(BaseModel):
    groups: list[GroupOut]
    items: list[ItemOut]
    # Só o que ainda é desejado; comprados e desistidos ficam fora
    total: Decimal
    count: int
    ungrouped_total: Decimal
    bought_total: Decimal


class PreviewIn(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class PreviewOut(BaseModel):
    url: str
    name: str | None
    price: Decimal | None
    currency: str
    image_url: str | None
    store: str | None


def _clean(text: str | None) -> str | None:
    return (text.strip() or None) if text else None


def _item_out(i: WishItem) -> ItemOut:
    history = [p.price for p in i.prices] or [i.price]
    return ItemOut(
        id=i.id,
        group_id=i.group_id,
        name=i.name,
        url=i.url,
        price=i.price,
        store=i.store,
        image_url=i.image_url,
        notes=i.notes,
        priority=i.priority,
        status=i.status,
        target_price=i.target_price,
        bought_at=i.bought_at,
        last_checked_at=i.last_checked_at,
        first_price=history[0],
        lowest_price=min(history),
        saved=i.saved or 0,
        created_at=i.created_at,
    )


def _group_out(g: WishGroup, totals: dict) -> GroupOut:
    pot = g.pot
    return GroupOut(
        id=g.id,
        name=g.name,
        pot_id=g.pot_id,
        pot_name=pot.name if pot else None,
        pot_balance=sum((i.balance for i in pot.investments), ZERO) if pot else None,
        total=totals["by_group"].get(g.id, ZERO),
        count=sum(1 for i in g.items if i.status == WishStatus.WANTED),
    )


def _get_item(db: DbSession, item_id: int) -> WishItem:
    item = db.get(WishItem, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Desejo não encontrado")
    return item


def _get_group(db: DbSession, group_id: int) -> WishGroup:
    group = db.get(WishGroup, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grupo não encontrado")
    return group


def _check_pot(db: DbSession, pot_id: int | None) -> None:
    if pot_id is not None and db.get(SavingsPot, pot_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cofrinho não encontrado")


@router.get("/wishlist", response_model=WishlistOut)
def get_wishlist(_: CurrentUser, db: DbSession) -> WishlistOut:
    """Grupos e desejos (prioridade alta e mais recentes primeiro) com os totais."""
    items = list(
        db.scalars(
            select(WishItem)
            .options(selectinload(WishItem.prices))
            .order_by(WishItem.priority, WishItem.created_at.desc())
        )
    )
    groups = list(db.scalars(select(WishGroup).order_by(WishGroup.name)))
    totals = wish_service.totals(items)
    return WishlistOut(
        groups=[_group_out(g, totals) for g in groups],
        items=[_item_out(i) for i in items],
        total=totals["wanted"],
        count=totals["wanted_count"],
        ungrouped_total=totals["by_group"].get(None, ZERO),
        bought_total=totals["bought"],
    )


@router.get("/wishlist/affordability")
def wishlist_affordability(_: CurrentUser, db: DbSession) -> dict:
    """Para cada desejo ainda não comprado: cabe, aperta ou não cabe neste ciclo, com a saúde
    financeira, parcelamento e quanto tempo para juntar (services/affordability.py)."""
    ctx = affordability.context(db, date.today())
    items = list(
        db.scalars(
            select(WishItem)
            .where(WishItem.status == WishStatus.WANTED)
            .order_by(WishItem.priority, WishItem.created_at.desc())
        )
    )
    return plain(
        {
            "health": ctx["health"],
            "items": {str(i.id): affordability.evaluate(i.price, ctx) for i in items},
            # Na ordem da lista (prioridade): quantos cabem juntos sem apertar
            "together": affordability.together([(str(i.id), i.price) for i in items], ctx),
        }
    )


@router.post("/wishlist/preview", response_model=PreviewOut)
def preview(body: PreviewIn, _: CurrentUser) -> PreviewOut:
    """Lê a página do produto e devolve o que der para preencher (nome, preço, imagem, loja)."""
    try:
        return PreviewOut(**wish_service.fetch_product(body.url))
    except wish_service.ProductFetchError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from None


@router.post("/wishlist/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(body: ItemIn, _: CurrentUser, db: DbSession) -> ItemOut:
    if body.group_id is not None:
        _get_group(db, body.group_id)
    item = WishItem(
        name=body.name.strip(),
        price=body.price,
        url=_clean(body.url),
        group_id=body.group_id,
        store=_clean(body.store),
        image_url=_clean(body.image_url),
        notes=_clean(body.notes),
        priority=body.priority,
        target_price=body.target_price or None,
        status=WishStatus.WANTED,
    )
    wish_service.set_price(item, body.price)
    db.add(item)
    db.commit()
    return _item_out(item)


@router.patch("/wishlist/items/{item_id}", response_model=ItemOut)
def update_item(item_id: int, body: ItemUpdate, _: CurrentUser, db: DbSession) -> ItemOut:
    """Muda só os campos enviados. Status BOUGHT grava a data da compra."""
    item = _get_item(db, item_id)
    fields = body.model_fields_set
    if "name" in fields and body.name:
        item.name = body.name.strip()
    if "price" in fields and body.price is not None:
        wish_service.set_price(item, body.price)
    if "group_id" in fields:
        if body.group_id is not None:
            _get_group(db, body.group_id)
        item.group_id = body.group_id
    for field in ("url", "store", "image_url", "notes"):
        if field in fields:
            setattr(item, field, _clean(getattr(body, field)))
    if "priority" in fields and body.priority is not None:
        item.priority = body.priority
    if "target_price" in fields:
        item.target_price = body.target_price or None
    if "status" in fields and body.status is not None and body.status != item.status:
        item.status = body.status
        item.bought_at = date.today() if body.status == WishStatus.BOUGHT else None
    db.commit()
    return _item_out(item)


@router.delete("/wishlist/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, _: CurrentUser, db: DbSession) -> None:
    db.delete(_get_item(db, item_id))
    db.commit()


@router.post("/wishlist/items/{item_id}/refresh", response_model=ItemOut)
def refresh_item(item_id: int, _: CurrentUser, db: DbSession) -> ItemOut:
    """Busca o preço atual na loja agora."""
    item = _get_item(db, item_id)
    if not item.url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esse desejo não tem link")
    try:
        wish_service.refresh_item(item)
    except wish_service.ProductFetchError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from None
    db.commit()
    return _item_out(item)


@router.post("/wishlist/items/{item_id}/jar", response_model=ItemOut)
def put_in_jar(item_id: int, body: JarIn, _: CurrentUser, db: DbSession) -> ItemOut:
    """O pote do desejo é uma meta, não uma conta: o dinheiro de verdade continua onde está."""
    item = _get_item(db, item_id)
    item.saved = max(Decimal("0"), (item.saved or Decimal("0")) + body.amount)
    db.commit()
    db.refresh(item)
    return _item_out(item)


@router.get("/wishlist/items/{item_id}/prices", response_model=list[PricePoint])
def item_prices(item_id: int, _: CurrentUser, db: DbSession) -> list[WishPrice]:
    return _get_item(db, item_id).prices


@router.post("/wishlist/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(body: GroupIn, _: CurrentUser, db: DbSession) -> GroupOut:
    _check_pot(db, body.pot_id)
    group = WishGroup(name=body.name.strip(), pot_id=body.pot_id)
    db.add(group)
    db.commit()
    return _group_out(group, wish_service.totals(group.items))


@router.patch("/wishlist/groups/{group_id}", response_model=GroupOut)
def update_group(group_id: int, body: GroupUpdate, _: CurrentUser, db: DbSession) -> GroupOut:
    """Renomeia e/ou liga a um cofrinho (pot_id null desliga)."""
    group = _get_group(db, group_id)
    if "name" in body.model_fields_set and body.name:
        group.name = body.name.strip()
    if "pot_id" in body.model_fields_set:
        _check_pot(db, body.pot_id)
        group.pot_id = body.pot_id
    db.commit()
    db.refresh(group)
    return _group_out(group, wish_service.totals(group.items))


@router.delete("/wishlist/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, _: CurrentUser, db: DbSession) -> None:
    """Apaga o grupo; os desejos dele ficam sem grupo."""
    group = _get_group(db, group_id)
    for item in group.items:
        item.group = None
    db.delete(group)
    db.commit()
