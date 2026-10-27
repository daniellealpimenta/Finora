"""O comentário do mascote nos e-mails, escrito pelo LLM local (Ollama).

O modelo recebe só os números já calculados (`facts`, já formatados) e escreve uma ou duas
frases. Antes de entrar no e-mail, cada número do texto é conferido contra a lista: se ele
citar algum que não está lá (inventou ou fez conta), o comentário é descartado e o e-mail sai
sem ele. Com o Ollama fechado ou sem modelo, também sai sem.
"""

import logging
import re

import httpx
from sqlalchemy.orm import Session

from app.services import llm
from app.services import mascot as mascot_service

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, read=180.0)
_NUMBER = re.compile(r"\d+(?:\.\d{3})*(?:,\d+)?")
MAX_CHARS = 320


def numbers_ok(text: str, facts: dict[str, str]) -> bool:
    """Todo número do texto aparece, igual, em algum dos fatos."""
    allowed = set(_NUMBER.findall(" ".join(facts.values())))
    return all(n in allowed for n in _NUMBER.findall(text))


def _clean(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    text = " ".join(text.split()).strip().strip('"“”')
    return text.replace("**", "")


def prompt(name: str, topic: str, facts: dict[str, str]) -> list[dict]:
    rules = (
        f"Você é o {name}, o mascote do Finora, um app de finanças pessoais. Escreva um "
        f"comentário curto sobre {topic}: uma ou duas frases, no máximo 250 caracteres, em "
        "português do Brasil, num tom calmo e prático, como um amigo que entende de dinheiro. "
        "Aponte o que mais importa ou uma atitude simples. Regras: use só números da lista, "
        "escritos exatamente como estão (com R$ e vírgula); não faça contas; não invente "
        "números; sem saudação, sem emoji, sem markdown, sem aspas."
    )
    data = "\n".join(f"- {k}: {v}" for k, v in facts.items())
    return [{"role": "system", "content": rules}, {"role": "user", "content": data}]


def write(
    db: Session, topic: str, facts: dict[str, str], http: httpx.Client | None = None
) -> str | None:
    model = llm.get_model(db)
    if not llm.is_installed(model, llm.installed()):
        return None
    body = {
        "model": model,
        "messages": prompt(mascot_service.mascot_name(db), topic, facts),
        "stream": False,
        "think": False,
        # Mesmo num_ctx do assistente: com outro valor o Ollama recarregaria o modelo
        "keep_alive": llm.KEEP_ALIVE,
        "options": {"num_ctx": llm.CONTEXT_TOKENS, "temperature": 0.4},
    }
    client = http or httpx.Client(timeout=_TIMEOUT)
    try:
        resp = client.post(llm._url("/api/chat"), json=body)
        resp.raise_for_status()
        text = _clean(resp.json().get("message", {}).get("content", ""))
    except (httpx.HTTPError, ValueError):
        logger.warning("Comentário do mascote: o Ollama não respondeu")
        return None
    finally:
        if http is None:
            client.close()
    if not text or len(text) > MAX_CHARS:
        return None
    if not numbers_ok(text, facts):
        logger.info("Comentário do mascote descartado: número fora dos dados (%s)", text)
        return None
    return text
