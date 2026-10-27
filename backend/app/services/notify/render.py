"""O e-mail em HTML (tabelas e estilo inline, como os clientes de e-mail exigem) e em texto.

Cada mensagem é uma lista de blocos. Blocos `private` citam lojas ou transações: saem no nível
"só os totais", e os `totals_only` (a versão sem lojas) entram no lugar. No nível "discreto" o
corpo vira uma frase sem números.
"""

from dataclasses import dataclass, field
from decimal import Decimal
from html import escape
from pathlib import Path

from app.services.insights import brl

ASSETS = Path(__file__).resolve().parents[2] / "assets" / "mascots"

INK = "#0a1016"
MUTED = "#3b4754"
LINE = "#d6dde4"
ACCENT = "#8a5300"
POSITIVE = "#00745b"
NEGATIVE = "#c1311a"
WARNING = "#9a5000"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
TONE = {"pos": POSITIVE, "neg": NEGATIVE, "warn": WARNING, None: INK}
BOX = {"warn": ("#fbeeeb", NEGATIVE), "ok": ("#e8f4f0", POSITIVE), "info": ("#f2f4f7", MUTED)}

SECTIONS = {
    "/": "Visão geral",
    "/transacoes": "Transações",
    "/orcamentos": "Orçamentos",
    "/cofrinhos": "Cofrinhos",
    "/desejos": "Desejos",
    "/contas": "Contas",
}

KIND_LABEL = {
    "cycle_ending": "ciclo acabando",
    "cycle_closed": "resumo do ciclo",
    "mid_cycle": "meio do ciclo",
    "card_due": "fatura",
    "unusual": "alerta",
    "category": "gasto por área",
    "wish": "lista de desejos",
    "price_up": "conta fixa",
    "installment_end": "parcelas",
    "cycle_red": "alerta",
    "bank": "conexão",
    "test": "teste",
}


@dataclass
class P:
    text: str
    private: bool = False
    totals_only: bool = False  # só no nível "só os totais" (versão sem lojas)


@dataclass
class Heading:
    text: str
    private: bool = False
    totals_only: bool = False  # só no nível "só os totais" (versão sem lojas)


@dataclass
class Hero:
    label: str
    value: Decimal
    note: str | None = None
    private: bool = False
    totals_only: bool = False  # só no nível "só os totais" (versão sem lojas)


@dataclass
class Row:
    label: str
    value: str
    tone: str | None = None  # pos | neg | warn
    strong: bool = False


@dataclass
class Rows:
    rows: list[Row]
    private: bool = False
    totals_only: bool = False  # só no nível "só os totais" (versão sem lojas)


@dataclass
class Box:
    tone: str  # warn | ok | info
    title: str
    text: str = ""
    private: bool = False
    totals_only: bool = False  # só no nível "só os totais" (versão sem lojas)


@dataclass
class Bar:
    left: str
    right: str
    fraction: float
    tone: str = "pos"
    private: bool = False
    totals_only: bool = False  # só no nível "só os totais" (versão sem lojas)


@dataclass
class Say:
    """Comentário do mascote. Preenchido pelo LLM na hora do envio (ver comment.py)."""

    text: str
    private: bool = False
    totals_only: bool = False  # só no nível "só os totais" (versão sem lojas)


@dataclass
class Message:
    kind: str
    keys: list[str]
    subject: str
    preheader: str
    blocks: list
    # Seção do Finora com os detalhes. Os e-mails não têm botão: o Finora roda neste
    # computador, e um link para ele não abriria no celular nem com o app fechado
    cta_path: str = "/"
    # Assunto sem lojas (nível "só os totais"); None: o mesmo
    totals_subject: str | None = None
    # Nível "discreto": sem números
    discreet_subject: str = "Novidade no Finora"
    discreet_text: str = "Tem novidade nas suas finanças. Abra o Finora para ver."
    # Números que o mascote pode citar no comentário (rótulo -> valor já formatado)
    facts: dict[str, str] | None = None
    # Mensagem com mais de um aviso dentro (ex.: compras do mesmo sync): um por chave no log
    extra: dict = field(default_factory=dict)


# --- HTML ------------------------------------------------------------------------------


def _money_html(value: Decimal) -> str:
    text = brl(value).replace("R$ ", "")
    sign = "−" if value < 0 else ""
    return (
        f'<span style="font-size:15px;font-weight:600;color:{ACCENT};margin-right:4px">R$</span>'
        f"{escape(sign + text.lstrip('−'))}"
    )


def _block_html(b) -> str:
    if isinstance(b, P):
        return f'<p style="margin:0 0 14px">{escape(b.text)}</p>'
    if isinstance(b, Heading):
        return f'<p style="margin:18px 0 6px;font-weight:700;font-size:15px">{escape(b.text)}</p>'
    if isinstance(b, Hero):
        note = (
            f'<div style="font-size:13px;color:{MUTED};margin-top:2px">{escape(b.note)}</div>'
            if b.note
            else ""
        )
        return (
            f'<div style="margin:0 0 16px"><div style="font-size:12px;color:{MUTED}">'
            f"{escape(b.label)}</div>"
            f'<div style="font-size:34px;line-height:1.15;letter-spacing:-0.5px">'
            f"{_money_html(b.value)}</div>{note}</div>"
        )
    if isinstance(b, Rows):
        cells = "".join(
            f'<tr><td style="padding:8px 0;border-bottom:1px solid {LINE};'
            f'{"font-weight:700;" if r.strong else ""}">{escape(r.label)}</td>'
            f'<td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid {LINE};'
            f'white-space:nowrap;font-weight:{700 if r.strong else 600};color:{TONE[r.tone]}">'
            f"{escape(r.value)}</td></tr>"
            for r in b.rows
        )
        return (
            f'<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;'
            f'border-top:1px solid {LINE};margin:0 0 16px">{cells}</table>'
        )
    if isinstance(b, Box):
        bg, edge = BOX[b.tone]
        text = f" {escape(b.text)}" if b.text else ""
        return (
            f'<div style="background:{bg};border-left:3px solid {edge};border-radius:6px;'
            f'padding:10px 12px;margin:0 0 14px"><b>{escape(b.title)}</b>{text}</div>'
        )
    if isinstance(b, Bar):
        width = max(0, min(100, round(b.fraction * 100)))
        color = TONE.get(b.tone, POSITIVE)
        return (
            f'<div style="margin:0 0 16px"><table width="100%" cellpadding="0" cellspacing="0">'
            f'<tr><td style="font-size:12px;color:{MUTED}">{escape(b.left)}</td>'
            f'<td align="right" style="font-size:12px;color:{MUTED}">{escape(b.right)}</td></tr>'
            f"</table>"
            f'<div style="height:8px;background:#e4e9ef;border-radius:99px;margin-top:4px">'
            f'<div style="height:8px;width:{width}%;background:{color};border-radius:99px">'
            f"</div></div></div>"
        )
    if isinstance(b, Say):
        return (
            f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf3f8;'
            f'border-radius:12px;margin:0 0 16px"><tr>'
            f'<td width="52" valign="top" style="padding:12px 0 12px 12px">'
            f'<img src="cid:mascot" width="40" height="41" alt="" style="display:block"></td>'
            f'<td style="padding:12px 14px 12px 10px;font-size:14px">{escape(b.text)}'
            f'<div style="font-size:11px;color:#8f2f5a;margin-top:4px">'
            f"Comentário escrito no seu computador</div></td></tr></table>"
        )
    raise TypeError(type(b))


def _block_text(b) -> str:
    if isinstance(b, P | Heading):
        return b.text
    if isinstance(b, Hero):
        return f"{b.label}: {brl(b.value)}" + (f"\n{b.note}" if b.note else "")
    if isinstance(b, Rows):
        return "\n".join(f"- {r.label}: {r.value}" for r in b.rows)
    if isinstance(b, Box):
        return f"{b.title} {b.text}".strip()
    if isinstance(b, Bar):
        return f"{b.left} (meta: {b.right})"
    if isinstance(b, Say):
        return f"“{b.text}”"
    raise TypeError(type(b))


@dataclass
class Rendered:
    subject: str
    html: str
    text: str
    images: dict[str, bytes]


def mascot_png(mascot: str) -> bytes | None:
    path = ASSETS / f"{mascot}.png"
    return path.read_bytes() if path.is_file() else None


def render(
    msg: Message,
    *,
    detail: str,
    name: str,
    mascot: str,
    reason: str | None = None,
) -> Rendered:
    """`name`: como cumprimentar ("daniel"). `reason`: por que a pessoa recebe (rodapé)."""
    if detail == "discreet":
        subject = msg.discreet_subject
        preheader = msg.discreet_text
        blocks: list = [P(msg.discreet_text)]
    else:
        subject = (msg.totals_subject or msg.subject) if detail == "totals" else msg.subject
        preheader = msg.preheader
        blocks = [b for b in msg.blocks if not (b.private if detail == "totals" else b.totals_only)]
    # Comentário sem texto (o modelo não respondeu ou errou um número): some do e-mail
    blocks = [b for b in blocks if not (isinstance(b, Say) and not b.text)]
    where = f"Os detalhes estão no Finora, em {SECTIONS.get(msg.cta_path, 'Visão geral')}."
    greeting = f"Oi, {name}."
    footer = reason or "Você recebe este e-mail porque ligou os avisos em Perfil › Avisos."

    html = (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(subject)}</title></head>"
        f'<body style="margin:0;padding:0;background:#eef2f5">'
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">'
        f"{escape(preheader)}</div>"
        f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5">'
        f'<tr><td align="center" style="padding:24px 12px">'
        f'<table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;'
        f'background:#ffffff;border-radius:14px;overflow:hidden;font-family:{FONT}">'
        f'<tr><td style="background:#141a20;padding:14px 20px;color:#e6ebef">'
        f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="font-size:17px;font-weight:700;color:#e6ebef">'
        f'<span style="display:inline-block;width:18px;height:18px;border-radius:9px;'
        f'background:#d2ac6a;vertical-align:-3px;margin-right:8px"></span>Finora</td>'
        f'<td align="right" style="font-size:12px;color:#8c99a5">'
        f"{escape(KIND_LABEL.get(msg.kind, ''))}</td></tr></table></td></tr>"
        f'<tr><td style="padding:22px 20px 8px;font-size:15px;line-height:1.55;color:{INK}">'
        f'<p style="margin:0 0 14px">{escape(greeting)}</p>'
        + "".join(_block_html(b) for b in blocks)
        + f'<p style="margin:4px 0 18px;font-weight:600">{escape(where)}</p>'
        f'<p style="margin:0;padding:12px 0 14px;border-top:1px solid {LINE};font-size:12px;'
        f'color:#6b7682">{escape(footer)}</p>'
        f"</td></tr></table></td></tr></table></body></html>"
    )
    text = "\n\n".join([greeting, *(_block_text(b) for b in blocks), where, footer])
    images: dict[str, bytes] = {}
    if any(isinstance(b, Say) for b in blocks):
        png = mascot_png(mascot)
        if png:
            images["mascot"] = png
    return Rendered(subject=subject, html=html, text=text, images=images)
