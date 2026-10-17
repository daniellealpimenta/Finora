from datetime import date
from decimal import Decimal

from app.integrations.importers.ofx import parse_ofx

# Formato SGML (OFX 1.x) como exportado por bancos brasileiros, em cp1252
SGML = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>0341<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261001<DTEND>20261031
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261005120000[-3:BRT]
<TRNAMT>-45,90
<FITID>A1
<MEMO>PADARIA SÃO JOSÉ
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261006
<TRNAMT>3500.00
<FITID>A2
<NAME>SALARIO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1234.56<DTASOF>20261031</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
""".encode("cp1252")

CARD = b"""<?xml version="1.0" encoding="UTF-8"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<CCACCTFROM><ACCTID>nubank-card</ACCTID></CCACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003000000</DTPOSTED>
<TRNAMT>-29.90</TRNAMT><FITID>c-1</FITID><MEMO>Uber</MEMO></STMTTRN>
</BANKTRANLIST>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>
"""


def test_parse_sgml_checking():
    st = parse_ofx(SGML)
    assert not st.is_credit_card
    assert (st.bank_id, st.account_id, st.balance) == ("0341", "12345-6", Decimal("1234.56"))
    first, second = st.transactions
    assert first.fitid == "A1" and first.date == date(2026, 10, 5)
    assert first.amount == Decimal("-45.90")
    assert first.description == "PADARIA SÃO JOSÉ"
    assert second.amount == Decimal("3500.00") and second.description == "SALARIO"


def test_parse_xml_credit_card():
    st = parse_ofx(CARD)
    assert st.is_credit_card and st.account_id == "nubank-card"
    assert [(t.fitid, t.amount) for t in st.transactions] == [("c-1", Decimal("-29.90"))]


def test_import_endpoint_is_idempotent(client, auth_headers):
    files = {"file": ("extrato.ofx", SGML, "application/x-ofx")}
    first = client.post("/import/ofx", files=files, headers=auth_headers)
    assert first.status_code == 200, first.text
    assert (first.json()["created"], first.json()["skipped"]) == (2, 0)

    again = client.post("/import/ofx", files=files, headers=auth_headers).json()
    assert (again["created"], again["skipped"]) == (0, 2)
    assert again["account_id"] == first.json()["account_id"]

    listing = client.get("/transactions", headers=auth_headers, params={"month": "2026-10"})
    data = listing.json()
    assert data["total"] == 2
    assert Decimal(data["income"]) == Decimal("3500") and Decimal(data["expense"]) == Decimal(
        "-45.90"
    )


def test_import_rejects_non_ofx(client, auth_headers):
    files = {"file": ("x.ofx", b"isso nao e um ofx", "text/plain")}
    assert client.post("/import/ofx", files=files, headers=auth_headers).status_code == 400
