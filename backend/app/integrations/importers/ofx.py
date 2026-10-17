"""Leitor de extratos OFX (v1 SGML e v2 XML), o formato que os bancos brasileiros exportam.

Implementação própria e tolerante: no SGML as tags de valor não têm fechamento
(`<TRNAMT>-12.50`), e cada banco formata um pouco diferente.
"""

import hashlib
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation


@dataclass
class OfxTransaction:
    fitid: str
    date: date
    amount: Decimal  # negativo = saída
    description: str


@dataclass
class OfxStatement:
    is_credit_card: bool
    bank_id: str | None
    account_id: str | None
    balance: Decimal | None
    transactions: list[OfxTransaction]


class OfxError(ValueError):
    pass


_BLOCK = re.compile(r"<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|(?=</BANKTRANLIST>))", re.S | re.I)


def _decode(raw: bytes) -> str:
    header = raw[:500].decode("ascii", errors="ignore").upper()
    if "CHARSET:1252" in header or "ENCODING:USASCII" in header:
        return raw.decode("cp1252", errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def _tag(block: str, name: str) -> str | None:
    match = re.search(rf"<{name}>([^<\r\n]*)", block, re.I)
    return match.group(1).strip() if match else None


def _parse_date(value: str) -> date:
    digits = re.match(r"(\d{4})(\d{2})(\d{2})", value)
    if not digits:
        raise OfxError(f"Data inválida no OFX: {value!r}")
    return date(int(digits.group(1)), int(digits.group(2)), int(digits.group(3)))


def _parse_amount(value: str) -> Decimal:
    cleaned = value.replace(" ", "")
    if "," in cleaned and "." in cleaned:  # 1.234,56
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        cleaned = cleaned.replace(",", ".")
    try:
        return Decimal(cleaned)
    except InvalidOperation as exc:
        raise OfxError(f"Valor inválido no OFX: {value!r}") from exc


def parse_ofx(raw: bytes) -> OfxStatement:
    text = _decode(raw)
    if "<OFX>" not in text.upper():
        raise OfxError("Arquivo não parece ser um OFX")

    transactions = []
    for block in _BLOCK.findall(text):
        dt, amount = _tag(block, "DTPOSTED"), _tag(block, "TRNAMT")
        if not dt or not amount:
            continue
        description = " ".join(p for p in (_tag(block, "NAME"), _tag(block, "MEMO")) if p) or (
            _tag(block, "TRNTYPE") or "Transação"
        )
        tx_date, tx_amount = _parse_date(dt), _parse_amount(amount)
        fitid = (
            _tag(block, "FITID")
            or hashlib.sha1(f"{tx_date}|{tx_amount}|{description}".encode()).hexdigest()
        )
        transactions.append(OfxTransaction(fitid, tx_date, tx_amount, description[:512]))

    balance = None
    ledger = re.search(r"<LEDGERBAL>(.*?)(?:</LEDGERBAL>|$)", text, re.S | re.I)
    if ledger and (bal := _tag(ledger.group(1), "BALAMT")):
        balance = _parse_amount(bal)

    return OfxStatement(
        is_credit_card="<CCSTMTRS>" in text.upper(),
        bank_id=_tag(text, "BANKID") or _tag(text, "ORG"),
        account_id=_tag(text, "ACCTID"),
        balance=balance,
        transactions=transactions,
    )
