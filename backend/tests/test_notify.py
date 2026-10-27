from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db.models import (
    Account,
    AccountType,
    Category,
    EmailLog,
    Transaction,
    TransactionSource,
)
from app.services.categories import ensure_categories
from app.services.notify import comment, mailer, outbox, rules
from app.services.notify.render import Box, Hero, Message, Row, Rows, render
from app.services.notify.settings import Account as MailAccount
from app.services.notify.settings import get_account, get_config, save_account, save_config

TODAY = date(2026, 10, 27)
NOW = datetime(2026, 10, 27, 10, 0).astimezone()


def _account() -> MailAccount:
    return MailAccount("smtp.gmail.com", 587, "finora@gmail.com", "abcdabcdabcdabcd", "Finora", "")


def _txns(db, rows):
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    acc = Account(name="Cartão", type=AccountType.CREDIT_CARD, balance=Decimal("0"))
    db.add(acc)
    db.flush()
    for i, (d, amount, key, desc) in enumerate(rows):
        db.add(
            Transaction(
                account_id=acc.id,
                external_id=f"t{i}",
                source=TransactionSource.MANUAL,
                date=d,
                amount=Decimal(amount),
                description=desc,
                category_id=cat[key],
            )
        )
    db.commit()


# --- render ---------------------------------------------------------------------------


def test_detail_levels():
    msg = Message(
        kind="unusual",
        keys=["k"],
        subject="Compra de R$ 900,00 na Kabum",
        totals_subject="Compra de R$ 900,00",
        preheader="Foi você?",
        blocks=[
            Hero("Kabum", Decimal("900"), private=True),
            Hero("Cartão", Decimal("900"), totals_only=True),
            Rows([Row("Por quê", "6x o normal")]),
            Box("warn", "Também:", "iFood 2x", private=True),
        ],
        discreet_subject="Uma compra fora do padrão",
        discreet_text="Veja no Finora.",
    )
    args = dict(name="dono", mascot="pila")
    full = render(msg, detail="full", **args)
    assert full.subject == "Compra de R$ 900,00 na Kabum"
    assert "Kabum" in full.html and "iFood" in full.text and "Cartão" not in full.html
    totals = render(msg, detail="totals", **args)
    assert totals.subject == "Compra de R$ 900,00"
    assert "Kabum" not in totals.html and "iFood" not in totals.html and "Cartão" in totals.html
    discreet = render(msg, detail="discreet", **args)
    assert discreet.subject == "Uma compra fora do padrão"
    assert "900" not in discreet.html and "900" not in discreet.text
    assert "Oi, dono." in full.text and "Os detalhes estão no Finora" in full.text
    assert "<a " not in full.html  # sem botão: o Finora roda só neste computador


def test_comment_numbers_must_come_from_facts():
    facts = {"sobrou": "R$ 1.585,20", "guardou": "23%", "meta": "20%"}
    assert comment.numbers_ok("Sobraram R$ 1.585,20, 23% do que entrou.", facts)
    assert not comment.numbers_ok("Sobraram R$ 1.600,00.", facts)  # inventou
    assert not comment.numbers_ok("Guardou 3% acima da meta.", facts)  # fez conta


# --- regras ---------------------------------------------------------------------------


@pytest.fixture
def history(db):
    rows = [
        (TODAY - timedelta(days=20 + i * 7), "-50", "groceries", f"MERCADO {i}") for i in range(8)
    ]
    rows += [
        # Mensalidade: mesma loja e valor todo mês, nunca é alerta
        (date(2026, 8, 7), "-887.18", "education", "FACULDADE"),
        (date(2026, 9, 7), "-887.18", "education", "FACULDADE"),
        (date(2026, 10, 7), "-887.18", "education", "FACULDADE"),
        # Recentes
        (TODAY - timedelta(days=2), "-400", "groceries", "ATACADAO"),  # 8x o típico, loja nova
        (TODAY - timedelta(days=1), "-89.90", "delivery", "IFOOD"),
        (TODAY - timedelta(days=1), "-89.90", "delivery", "IFOOD"),  # cobrança repetida
        (TODAY - timedelta(days=1), "-35", "groceries", "PADARIA"),  # normal
    ]
    _txns(db, rows)


def test_unusual_rules(db, history):
    found = {i["label"]: i["reasons"] for i in rules.unusual_purchases(db, TODAY)}
    assert set(found) == {"ATACADAO", "IFOOD"}
    assert any("compra típica em Supermercado" in r for r in found["ATACADAO"])
    assert any("mesmo valor e loja" in r for r in found["IFOOD"])


# --- envio ----------------------------------------------------------------------------


@pytest.fixture
def outbox_db(db, history, monkeypatch):
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        mailer, "send", lambda acc, to, subject, *a, **k: sent.append((to, subject))
    )
    monkeypatch.setattr(comment, "write", lambda *a, **k: None)
    from app.core.security import hash_password
    from app.db.models import User

    db.add(User(email="dono@exemplo.com", password_hash=hash_password("x")))
    db.commit()
    save_account(db, _account())
    return sent


def test_run_baseline_then_only_new(db, outbox_db):
    sent = outbox_db
    # Primeira rodada: as compras que já existiam só ficam marcadas (sem lotar a caixa)
    outbox.run(db, NOW)
    assert not any("fora do seu padrão" in s or "Cobrança repetida" in s for _, s in sent)
    baseline = {e.key for e in db.scalars(select(EmailLog).where(EmailLog.status == "baseline"))}
    assert any(k.startswith("unusual:") for k in baseline)
    assert get_config(db)["baseline_done"] is True

    # Compra nova depois: vira alerta, uma vez só
    _txns(db, [(TODAY, "-1249", "shopping", "KABUM")])
    sent.clear()
    assert outbox.run(db, NOW) >= 1
    assert any("KABUM" in s for _, s in sent)
    assert all(to == "dono@exemplo.com" for to, _ in sent)
    sent.clear()
    outbox.run(db, NOW)
    assert not any("KABUM" in s for _, s in sent)


def test_run_respects_quiet_hours_and_switches(db, outbox_db):
    night = NOW.replace(hour=23)
    assert outbox.run(db, night) == 0
    assert outbox.run(db, NOW.replace(hour=6)) == 0
    save_config(db, {"enabled": False})
    assert outbox.run(db, NOW) == 0
    assert outbox_db == []


def test_send_error_keeps_notice_for_next_round(db, outbox_db, monkeypatch):
    save_config(db, {"baseline_done": True})

    def fail(*a, **k):
        raise mailer.MailError("O servidor recusou o login.")

    monkeypatch.setattr(mailer, "send", fail)
    assert outbox.run(db, NOW) == 0
    assert get_config(db)["last_error"]["message"] == "O servidor recusou o login."
    assert db.scalar(select(EmailLog).where(EmailLog.status == "sent")) is None


# --- API ------------------------------------------------------------------------------


def test_account_api_never_returns_password(client, auth_headers, db, monkeypatch):
    checked = []
    monkeypatch.setattr(mailer, "check_login", lambda acc: checked.append(acc.user))
    res = client.put(
        "/notifications/account",
        json={"user": "Finora@gmail.com", "password": "abcd efgh ijkl mnop"},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    assert checked == ["finora@gmail.com"]
    assert "abcdefghijklmnop" not in res.text and "abcd" not in res.text
    assert res.json()["account"] == {
        "user": "finora@gmail.com",
        "host": "smtp.gmail.com",
        "port": 587,
        "source": "profile",
    }
    # Guardada criptografada, e sem espaços
    assert get_account(db).password == "abcdefghijklmnop"

    # Trocar só o servidor mantém a senha
    res = client.put(
        "/notifications/account",
        json={"user": "finora@gmail.com", "port": 465},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert get_account(db).port == 465 and get_account(db).password == "abcdefghijklmnop"

    def refuse(acc):
        raise mailer.MailError("O servidor recusou o login.")

    monkeypatch.setattr(mailer, "check_login", refuse)
    bad = client.put(
        "/notifications/account",
        json={"user": "finora@gmail.com", "password": "errada"},
        headers=auth_headers,
    )
    assert bad.status_code == 400
    assert get_account(db).password == "abcdefghijklmnop"  # não salvou a errada


def test_config_api(client, auth_headers):
    res = client.put(
        "/notifications/config",
        json={"detail": "totals", "kinds": {"wish": False}, "to": "Outro@Exemplo.com"},
        headers=auth_headers,
    )
    body = res.json()
    assert body["detail"] == "totals" and body["kinds"]["wish"] is False
    assert body["kinds"]["unusual"] is True and body["to"] == "outro@exemplo.com"
    body = client.put("/notifications/config", json={"clear_to": True}, headers=auth_headers).json()
    assert body["to"] is None and body["default_to"] == "dono@exemplo.com"
    bad = client.put("/notifications/config", json={"kinds": {"x": True}}, headers=auth_headers)
    assert bad.status_code == 400


def test_test_email(client, auth_headers, db, monkeypatch):
    res = client.post("/notifications/test", headers=auth_headers)
    assert res.status_code == 400  # sem conta
    sent = []
    monkeypatch.setattr(mailer, "send", lambda acc, to, subject, *a, **k: sent.append(to))
    save_account(db, _account())
    res = client.post("/notifications/test", headers=auth_headers)
    assert res.status_code == 200 and sent == ["dono@exemplo.com"]
