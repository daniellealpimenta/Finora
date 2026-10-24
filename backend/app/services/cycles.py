"""Ciclos: o período em que o usuário planeja o dinheiro.

Se o usuário escolheu um dia de início (`AppSetting` "cycle", `start_day`), o ciclo vai desse
dia até a véspera dele no mês seguinte (dia 11: 11/09 a 10/10). Serve para quem paga as contas
num dia fixo: o salário do fim do mês e as contas do dia 10 ficam no mesmo ciclo.

Sem essa escolha, o ciclo é o período entre dois fechamentos da fatura do cartão principal.

O ciclo de setembro começa no dia seguinte ao fechamento de setembro e termina no
fechamento de outubro (ex.: 09/09 a 08/10). A chave é o mês em que ele começa ("2026-09").
É o período que o banco usa na fatura, e o que o usuário usa para se planejar: o salário
do fim de setembro paga a fatura que fecha em outubro.

Fechamento de cada cartão (a Pluggy não informa a data; o PicPay manda vazio):
  1. Dia escolhido pelo usuário no cartão (`Account.closing_day`), se houver
  2. Vencimento menos a distância entre fechamento e vencimento daquele cartão: a mediana,
     entre as faturas cujo último lançamento (`billPostDate`) cai até 10 dias antes do
     vencimento. Com menos de 3 medidas, 7 dias (o padrão dos bancos).

Cartão principal = o de maior gasto nas últimas faturas. Sem cartão com faturas, o ciclo é
o mês do calendário.

Lançamentos de cartão contam no ciclo em que a fatura deles fecha (pelo `billId`; sem ele,
na primeira fatura que fecha depois da compra). Lançamentos de conta, na própria data.
"""

import calendar
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Account, AccountType, AppSetting, CardBill, Transaction
from app.services.periods import month_bounds, month_key

DEFAULT_GAP = timedelta(days=7)
MAX_GAP = timedelta(days=10)
MIN_GAP_SAMPLES = 3
ONE_DAY = timedelta(days=1)
# Faturas usadas para escolher o cartão principal
_REFERENCE_BILLS = 6
SETTING_KEY = "cycle"
# Até 28: todo mês tem esse dia, então todo ciclo começa no mesmo dia
MAX_START_DAY = 28


def clamp_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _shift(year: int, month: int, n: int) -> tuple[int, int]:
    total = year * 12 + month - 1 + n
    return total // 12, total % 12 + 1


def shift_key(key: str, n: int) -> str:
    year, month = _shift(*(int(p) for p in key.split("-")), n)
    return f"{year:04d}-{month:02d}"


@dataclass
class CardSchedule:
    """Calendário de faturas de um cartão: vencimentos conhecidos e como achar o fechamento."""

    account_id: int
    name: str
    dues: dict[tuple[int, int], date]  # (ano, mês) -> vencimento conhecido
    bill_dues: dict[str, date]  # billId -> vencimento
    due_day: int
    gap: timedelta
    closing_day: int | None = None

    def close_for_due(self, due: date) -> date:
        if self.closing_day:
            close = clamp_day(due.year, due.month, self.closing_day)
            if close >= due:
                close = clamp_day(*_shift(due.year, due.month, -1), self.closing_day)
            return close
        return due - self.gap

    def due_in_month(self, year: int, month: int) -> date:
        return self.dues.get((year, month)) or clamp_day(year, month, self.due_day)

    def closing_in_month(self, year: int, month: int) -> date:
        """Fechamento que cai neste mês (da fatura que vence neste mês ou no seguinte)."""
        for y, m in ((year, month), _shift(year, month, 1)):
            close = self.close_for_due(self.due_in_month(y, m))
            if (close.year, close.month) == (year, month):
                return close
        day = self.closing_day or (self.due_in_month(year, month) - self.gap).day
        return clamp_day(year, month, day)

    def close_on_or_after(self, d: date) -> date:
        """Primeiro fechamento no dia `d` ou depois: a fatura em que uma compra de `d` entra."""
        year, month = d.year, d.month
        while True:
            close = self.closing_in_month(year, month)
            if close >= d:
                return close
            year, month = _shift(year, month, 1)

    @property
    def last_close(self) -> date:
        """Fechamento da fatura fechada mais recente."""
        return self.close_for_due(max(self.bill_dues.values()))

    def bill_close(self, bill_id: str | None) -> date | None:
        due = self.bill_dues.get(bill_id) if bill_id else None
        return self.close_for_due(due) if due else None

    def next_due_after(self, close: date) -> date:
        """Vencimento da fatura que fecha em `close`."""
        for y, m in ((close.year, close.month), _shift(close.year, close.month, 1)):
            due = self.due_in_month(y, m)
            if due > close:
                return due
        return close + self.gap


@dataclass
class Cycles:
    reference: CardSchedule | None
    cards: dict[int, CardSchedule]
    start_day: int | None = None  # escolhido pelo usuário; senão, o fechamento do principal
    _bounds: dict[str, tuple[date, date]] = field(default_factory=dict)

    def bounds(self, key: str) -> tuple[date, date]:
        """Ciclo como intervalo [início, fim) de datas."""
        if key not in self._bounds:
            if self.start_day:
                year, month = (int(p) for p in key.split("-"))
                self._bounds[key] = (
                    clamp_day(year, month, self.start_day),
                    clamp_day(*_shift(year, month, 1), self.start_day),
                )
            elif self.reference is None:
                self._bounds[key] = month_bounds(key)
            else:
                year, month = (int(p) for p in key.split("-"))
                start = self.reference.closing_in_month(year, month) + ONE_DAY
                end = self.reference.closing_in_month(*_shift(year, month, 1)) + ONE_DAY
                self._bounds[key] = (start, end)
        return self._bounds[key]

    def key_of(self, d: date) -> str:
        key = month_key(d)
        start, end = self.bounds(key)
        if d < start:
            return shift_key(key, -1)
        if d >= end:
            return shift_key(key, 1)
        return key

    def competence(self, account_id: int, tx_date: date, bill_id: str | None) -> date:
        """Data que decide o ciclo do lançamento: o fechamento da fatura, para cartões."""
        schedule = self.cards.get(account_id)
        if schedule is None:
            return tx_date
        closed = schedule.bill_close(bill_id)
        if closed:
            return closed
        # Sem fatura e perto do último fechamento: o banco já fechou sem ela, então está na
        # aberta (o fechamento estimado pode errar um dia para mais)
        last = schedule.last_close
        if last - MAX_GAP < tx_date <= last:
            return schedule.close_on_or_after(last + ONE_DAY)
        return schedule.close_on_or_after(tx_date)

    def place(self, account_id: int, tx_date: date, bill_id: str | None) -> tuple[str, date]:
        """Ciclo do lançamento e a data em que ele aparece dentro do ciclo (a própria data,
        trazida para dentro do ciclo quando a compra é de antes dele)."""
        key = self.key_of(self.competence(account_id, tx_date, bill_id))
        start, end = self.bounds(key)
        return key, min(max(tx_date, start), end - ONE_DAY)


def bill_id_of(raw: dict | None) -> str | None:
    """Fatura a que o lançamento de cartão pertence (creditCardMetadata.billId)."""
    return ((raw or {}).get("creditCardMetadata") or {}).get("billId")


def get_start_day(db: Session) -> int | None:
    setting = db.get(AppSetting, SETTING_KEY)
    return (setting.value or {}).get("start_day") if setting else None


def save_start_day(db: Session, day: int | None) -> None:
    """Dia em que o ciclo começa; None volta a seguir o fechamento do cartão principal."""
    setting = db.get(AppSetting, SETTING_KEY)
    if setting is None:
        db.add(AppSetting(key=SETTING_KEY, value={"start_day": day}))
    else:
        setting.value = {**(setting.value or {}), "start_day": day}
    db.commit()


def load(db: Session) -> Cycles:
    cards = list(db.scalars(select(Account).where(Account.type == AccountType.CREDIT_CARD)))
    bills_by_card: dict[int, list[CardBill]] = defaultdict(list)
    for bill in db.scalars(select(CardBill)):
        bills_by_card[bill.account_id].append(bill)

    # Último lançamento de cada fatura: mede a distância entre fechamento e vencimento
    last_post: dict[str, date] = {}
    card_ids = [c.id for c in cards]
    if card_ids:
        for raw in db.scalars(select(Transaction.raw).where(Transaction.account_id.in_(card_ids))):
            meta = (raw or {}).get("creditCardMetadata") or {}
            bill_id, post = meta.get("billId"), meta.get("billPostDate")
            if bill_id and post:
                posted = date.fromisoformat(post[:10])
                if bill_id not in last_post or posted > last_post[bill_id]:
                    last_post[bill_id] = posted

    schedules: dict[int, CardSchedule] = {}
    weight: dict[int, float] = {}
    for card in cards:
        bills = sorted(bills_by_card.get(card.id, []), key=lambda b: b.due_date)
        if not bills:
            continue
        gaps = [
            b.due_date - last_post[b.external_id]
            for b in bills
            if b.external_id in last_post
            and timedelta(0) < b.due_date - last_post[b.external_id] <= MAX_GAP
        ]
        schedules[card.id] = CardSchedule(
            account_id=card.id,
            name=card.name,
            dues={(b.due_date.year, b.due_date.month): b.due_date for b in bills},
            bill_dues={b.external_id: b.due_date for b in bills},
            due_day=bills[-1].due_date.day,
            gap=timedelta(days=round(statistics.median(g.days for g in gaps)))
            if len(gaps) >= MIN_GAP_SAMPLES
            else DEFAULT_GAP,
            closing_day=card.closing_day,
        )
        weight[card.id] = float(sum(b.total_amount for b in bills[-_REFERENCE_BILLS:]))

    reference = schedules[max(weight, key=weight.get)] if weight else None
    return Cycles(reference=reference, cards=schedules, start_day=get_start_day(db))
