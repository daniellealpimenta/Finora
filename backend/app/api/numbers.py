"""Dinheiro como número no JSON das rotas que devolvem dicts (painel, cartões).

Sem response_model, o FastAPI manda Decimal como texto ("539.46"). O front trata esses
campos como number: somas viram concatenação e os gráficos perdem a escala. Aqui o Decimal
vira float só na saída; as contas continuam em Decimal no serviço.
"""

from decimal import Decimal
from typing import Any


def plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [plain(v) for v in value]
    return value
