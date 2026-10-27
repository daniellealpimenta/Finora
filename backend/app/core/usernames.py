"""Nome de usuário: alternativa ao e-mail no login.

De 3 a 24 caracteres: letras minúsculas sem acento, números, ponto, hífen e sublinhado,
começando e terminando com letra ou número. Sem "@", então nunca se confunde com um e-mail.
"""

import re

_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9._-]{1,22})[a-z0-9]$")

RULES = "De 3 a 24 caracteres: letras sem acento, números, ponto, hífen ou sublinhado"


def normalize(value: str) -> str:
    return value.strip().lower()


def is_valid(value: str) -> bool:
    return bool(_PATTERN.match(value))
