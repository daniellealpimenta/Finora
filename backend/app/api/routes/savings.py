"""Cofrinhos e aplicações (caixinhas, CDBs) que chegam pelo GET /investments da Pluggy."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import Investment, SavingsPot

router = APIRouter(tags=["cofrinhos"])


class InvestmentOut(BaseModel):
    id: int
    connection_id: int
    institution_name: str
    name: str
    type: str
    subtype: str | None
    balance: Decimal
    currency: str
    rate: Decimal | None
    rate_type: str | None
    amount_original: Decimal | None
    purchase_date: date | None
    due_date: date | None
    pot_id: int | None


class InvestmentUpdate(BaseModel):
    pot_id: int | None = None


class PotOut(BaseModel):
    id: int
    name: str
    goal_amount: Decimal | None
    balance: Decimal
    # Soma do valor aplicado em cada aplicação; rendeu = saldo - aplicado
    applied: Decimal
    earned: Decimal
    investments: int


class PotIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    # None ou 0 = sem meta
    goal_amount: Decimal | None = Field(default=None, ge=0)


class PotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    goal_amount: Decimal | None = Field(default=None, ge=0)


def _investment_out(i: Investment) -> InvestmentOut:
    return InvestmentOut(
        id=i.id,
        connection_id=i.connection_id,
        institution_name=i.connection.institution_name,
        name=i.name,
        type=i.type,
        subtype=i.subtype,
        balance=i.balance,
        currency=i.currency,
        rate=i.rate,
        rate_type=i.rate_type,
        amount_original=i.amount_original,
        purchase_date=i.purchase_date,
        due_date=i.due_date,
        pot_id=i.pot_id,
    )


def applied_amount(i: Investment) -> Decimal:
    """Valor aplicado; sem essa informação do banco, assume o saldo (rendimento zero)."""
    return i.amount_original if i.amount_original is not None else i.balance


def _pot_out(pot: SavingsPot) -> PotOut:
    balance = sum((i.balance for i in pot.investments), Decimal("0"))
    applied = sum((applied_amount(i) for i in pot.investments), Decimal("0"))
    return PotOut(
        id=pot.id,
        name=pot.name,
        goal_amount=pot.goal_amount,
        balance=balance,
        applied=applied,
        earned=balance - applied,
        investments=len(pot.investments),
    )


def _get_pot(db: DbSession, pot_id: int) -> SavingsPot:
    pot = db.get(SavingsPot, pot_id)
    if pot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cofrinho não encontrado")
    return pot


@router.get("/investments", response_model=list[InvestmentOut])
def list_investments(_: CurrentUser, db: DbSession) -> list[InvestmentOut]:
    """Aplicações, maior saldo primeiro."""
    items = db.scalars(select(Investment).order_by(Investment.balance.desc()))
    return [_investment_out(i) for i in items]


@router.patch("/investments/{investment_id}", response_model=InvestmentOut)
def move_investment(
    investment_id: int, body: InvestmentUpdate, _: CurrentUser, db: DbSession
) -> InvestmentOut:
    """Põe a aplicação num cofrinho (pot_id) ou a tira de todos (pot_id null)."""
    item = db.get(Investment, investment_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aplicação não encontrada")
    item.pot = _get_pot(db, body.pot_id) if body.pot_id is not None else None
    db.commit()
    return _investment_out(item)


@router.get("/pots", response_model=list[PotOut])
def list_pots(_: CurrentUser, db: DbSession) -> list[PotOut]:
    """Cofrinhos com saldo somado das aplicações, maior saldo primeiro."""
    pots = [_pot_out(p) for p in db.scalars(select(SavingsPot))]
    return sorted(pots, key=lambda p: p.balance, reverse=True)


@router.post("/pots", response_model=PotOut, status_code=status.HTTP_201_CREATED)
def create_pot(body: PotIn, _: CurrentUser, db: DbSession) -> PotOut:
    pot = SavingsPot(name=body.name.strip(), goal_amount=body.goal_amount or None)
    db.add(pot)
    db.commit()
    return _pot_out(pot)


@router.patch("/pots/{pot_id}", response_model=PotOut)
def update_pot(pot_id: int, body: PotUpdate, _: CurrentUser, db: DbSession) -> PotOut:
    """Renomeia e/ou muda a meta (só os campos enviados; goal_amount null remove a meta)."""
    pot = _get_pot(db, pot_id)
    if "name" in body.model_fields_set and body.name:
        pot.name = body.name.strip()
    if "goal_amount" in body.model_fields_set:
        pot.goal_amount = body.goal_amount or None
    db.commit()
    return _pot_out(pot)


@router.delete("/pots/{pot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pot(pot_id: int, _: CurrentUser, db: DbSession) -> None:
    """Apaga o cofrinho; as aplicações dele ficam sem cofrinho (nada é resgatado)."""
    pot = _get_pot(db, pot_id)
    for item in pot.investments:
        item.pot = None
    db.delete(pot)
    db.commit()
