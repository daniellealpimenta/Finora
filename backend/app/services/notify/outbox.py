"""Junta regras, comentário do mascote e envio. `run` roda no agendador a cada 15 minutos.

- Sem conta de envio, com os avisos desligados ou no silêncio da noite (22h às 8h): não faz nada;
  o que estava para sair sai na próxima rodada fora desse horário.
- Na primeira rodada, avisos de novidade e alertas que já existiam são só marcados (baseline):
  quem liga os avisos não recebe de uma vez tudo o que aconteceu antes. Os de calendário saem.
- Erro de envio não marca o aviso: ele tenta de novo na próxima rodada. O último erro fica na
  configuração, para o Perfil mostrar.
"""

import base64
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import EmailLog, User
from app.services import mascot as mascot_service
from app.services.notify import comment, mailer, rules
from app.services.notify.render import Message, P, Rendered, Say, render
from app.services.notify.settings import KINDS, get_account, get_config, save_config

logger = logging.getLogger(__name__)

QUIET_START, QUIET_END = 22, 8
CALENDAR = {k["id"] for k in KINDS if k["group"] == "calendar"}
LABEL = {k["id"]: k["label"] for k in KINDS}
TOPIC = {
    "cycle_ending": "o ciclo que está acabando",
    "cycle_closed": "o ciclo que acabou de fechar",
    "category": "os gastos que passaram do normal",
    "cycle_red": "o ciclo que, no ritmo atual, não fecha a conta",
}


def _user(db: Session) -> User | None:
    return db.scalar(select(User).order_by(User.id))


def recipient(db: Session, config: dict) -> str | None:
    if config.get("to"):
        return config["to"]
    user = _user(db)
    return user.email if user else None


def greeting_name(db: Session) -> str:
    user = _user(db)
    if user is None:
        return "tudo bem"
    return user.username or user.email.split("@")[0]


def _logged(db: Session) -> set[str]:
    return set(db.scalars(select(EmailLog.key)))


def due(db: Session, now: datetime, kinds: list[str], fresh=None) -> list[Message]:
    """Mensagens que estão para sair agora. Uma regra que falha não derruba as outras."""
    ctx = rules.Ctx(db=db, today=now.date(), now=now)
    fresh = fresh or (lambda _key: True)
    out: list[Message] = []
    for kind in kinds:
        try:
            out += rules.RULES[kind](ctx, fresh)
        except Exception:
            logger.exception("Aviso %s: a regra falhou", kind)
    return out


def _render(db: Session, msg: Message, config: dict, with_comment: bool) -> Rendered:
    if with_comment and msg.facts and msg.kind in TOPIC and config["detail"] != "discreet":
        text = comment.write(db, TOPIC[msg.kind], msg.facts)
        for b in msg.blocks:
            if isinstance(b, Say):
                b.text = text or ""
    return render(
        msg,
        detail=config["detail"],
        name=greeting_name(db),
        mascot=mascot_service.get_mascot(db),
        reason=(
            f"Você recebe este e-mail porque ligou “{LABEL[msg.kind]}” em Perfil › Avisos."
            if msg.kind in LABEL
            else None
        ),
    )


def _log(db: Session, msg: Message, status: str, subject: str | None) -> None:
    for key in msg.keys:
        db.add(EmailLog(kind=msg.kind, key=key, subject=subject, status=status))
    db.commit()


def run(db: Session, now: datetime | None = None) -> int:
    """Envia o que está para sair. Devolve quantos e-mails saíram."""
    now = now or datetime.now().astimezone()
    account = get_account(db)
    config = get_config(db)
    if account is None or not config["enabled"]:
        return 0
    if config["quiet"] and not QUIET_END <= now.hour < QUIET_START:
        return 0
    to = recipient(db, config)
    if not to:
        return 0
    logged = _logged(db)
    kinds = [k for k, on in config["kinds"].items() if on and k in rules.RULES]
    messages = due(db, now, kinds, fresh=lambda key: key not in logged)

    if not config["baseline_done"]:
        for msg in messages:
            if msg.kind not in CALENDAR:
                _log(db, msg, "baseline", msg.subject)
        messages = [m for m in messages if m.kind in CALENDAR]
        config = save_config(db, {"baseline_done": True})

    sent = 0
    for msg in messages:
        try:
            r = _render(db, msg, config, with_comment=True)
            mailer.send(account, to, r.subject, r.html, r.text, r.images)
        except mailer.MailError as exc:
            save_config(db, {"last_error": {"at": now.isoformat(), "message": str(exc)}})
            logger.warning("Aviso %s não enviado: %s", msg.kind, exc)
            break  # mesma conta, mesmo erro: tenta tudo de novo na próxima rodada
        except Exception:
            logger.exception("Aviso %s: erro ao montar o e-mail", msg.kind)
            continue
        _log(db, msg, "sent", r.subject)
        sent += 1
    if sent and config.get("last_error"):
        save_config(db, {"last_error": None})
    return sent


def send_test(db: Session) -> str:
    """E-mail de teste para o destinatário configurado. Devolve o endereço."""
    account = get_account(db)
    if account is None:
        raise mailer.MailError("Configure a conta de envio primeiro.")
    config = get_config(db)
    to = recipient(db, config)
    if not to:
        raise mailer.MailError("Sem destinatário: informe um e-mail em “Enviar para”.")
    msg = Message(
        kind="test",
        keys=[],
        subject="Teste do Finora: os avisos por e-mail estão funcionando",
        preheader="Se este e-mail chegou, está tudo certo.",
        blocks=[
            P("Se este e-mail chegou, a conta de envio está certa e os avisos vão chegar aqui."),
            Say(
                "Daqui em diante eu te aviso quando o ciclo estiver acabando, quando fechar "
                "e quando alguma coisa fugir da rotina."
            ),
        ],
        discreet_subject="Teste do Finora",
        discreet_text="Se este e-mail chegou, os avisos estão funcionando.",
    )
    r = render(
        msg,
        detail="full",
        name=greeting_name(db),
        mascot=mascot_service.get_mascot(db),
        reason="Você recebe este e-mail porque pediu um teste em Perfil › Avisos.",
    )
    mailer.send(account, to, r.subject, r.html, r.text, r.images)
    db.add(
        EmailLog(
            kind="test",
            key=f"test:{datetime.now(UTC).isoformat()}",
            subject=r.subject,
            status="sent",
        )
    )
    db.commit()
    return to


def preview(db: Session, kind: str, now: datetime | None = None) -> dict | None:
    """Como o aviso sairia agora com os dados atuais, mesmo que já tenha saído ou não esteja na
    data. Para o "Ver exemplo" do Perfil. O comentário do mascote não é gerado (é lento)."""
    now = now or datetime.now().astimezone()
    messages = due(db, now, [kind])
    if not messages and kind in ("cycle_ending", "mid_cycle", "cycle_closed"):
        messages = _calendar_anyway(db, now, kind)
    if not messages:
        return None
    msg = messages[0]
    for b in msg.blocks:
        if isinstance(b, Say):
            b.text = "Aqui entra um comentário curto do mascote, escrito pelo modelo local."
    r = _render(db, msg, get_config(db), with_comment=False)
    html = r.html
    for cid, data in r.images.items():
        uri = "data:image/png;base64," + base64.b64encode(data).decode()
        html = html.replace(f"cid:{cid}", uri)
    return {"subject": r.subject, "html": html}


def _calendar_anyway(db: Session, now: datetime, kind: str) -> list[Message]:
    """Avisos de calendário fora da data: simula o dia em que sairiam neste ciclo."""
    from datetime import timedelta

    ctx = rules.Ctx(db=db, today=now.date(), now=now)
    start, end = ctx.bounds
    day = {
        "cycle_ending": end - timedelta(days=2),
        "mid_cycle": start + (end - start) / 2 + timedelta(days=1),
        "cycle_closed": start + timedelta(days=1),
    }[kind]
    if day < now.date() and kind != "cycle_closed":
        return []
    when = now.replace(year=day.year, month=day.month, day=day.day)
    return due(db, when, [kind])
