"""Envio pelo SMTP. Gmail: smtp.gmail.com, porta 587 (STARTTLS), usuário = o endereço do Gmail
e senha = a senha de app de 16 letras (a senha normal não funciona)."""

import smtplib
import socket
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.services.notify.settings import Account

_TIMEOUT = 30


class MailError(Exception):
    """Mensagem já pronta para o usuário."""


def _connect(account: Account) -> smtplib.SMTP:
    context = ssl.create_default_context()
    try:
        if account.port == 465:
            server: smtplib.SMTP = smtplib.SMTP_SSL(
                account.host, account.port, timeout=_TIMEOUT, context=context
            )
        else:
            server = smtplib.SMTP(account.host, account.port, timeout=_TIMEOUT)
            server.starttls(context=context)
        server.login(account.user, account.password)
        return server
    except smtplib.SMTPAuthenticationError:
        raise MailError(
            "O servidor recusou o login. Confira o e-mail e a senha de app "
            "(16 letras, sem espaços; a senha normal do Gmail não funciona)."
        ) from None
    except (OSError, smtplib.SMTPException) as exc:
        if isinstance(exc, socket.gaierror | ConnectionError | TimeoutError):
            raise MailError(
                f"Não deu para falar com {account.host}. Confira a internet e o servidor."
            ) from None
        raise MailError(f"Erro no servidor de e-mail: {exc}") from None


def check_login(account: Account) -> None:
    """Só conecta e entra, sem enviar nada: valida a conta antes de salvar."""
    server = _connect(account)
    server.quit()


def send(
    account: Account,
    to: str,
    subject: str,
    html: str,
    text: str,
    images: dict[str, bytes] | None = None,
) -> None:
    """`images`: {cid: png}, referenciadas no HTML como `cid:<cid>`."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((account.from_name, account.user))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain="finora.local")
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    html_part = msg.get_payload()[1]
    for cid, data in (images or {}).items():
        html_part.add_related(data, maintype="image", subtype="png", cid=f"<{cid}>")
    server = _connect(account)
    try:
        server.send_message(msg)
    except smtplib.SMTPRecipientsRefused:
        raise MailError(f"O servidor recusou o destinatário {to}.") from None
    except smtplib.SMTPException as exc:
        raise MailError(f"Erro ao enviar: {exc}") from None
    finally:
        try:
            server.quit()
        except smtplib.SMTPException:
            pass
