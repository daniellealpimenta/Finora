"""Como a pessoa montou a Visão geral (AppSetting "panel"): ordem, tamanho, visualização de cada
card, o que está escondido e quais cards novos ela já experimentou.

O frontend é dono do formato; aqui só guardamos o JSON. Antes ficava só no localStorage, que o
programa (pywebview em modo privado) apagava a cada vez que fechava.
"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.db.models import AppSetting

router = APIRouter(prefix="/panel", tags=["painel"])

SETTING_KEY = "panel"
MAX_BYTES = 20_000  # um painel inteiro tem ~2 KB; isto só barra lixo


class PanelLayout(BaseModel):
    layout: dict[str, Any] | None


@router.get("", response_model=PanelLayout)
def get_panel(_: CurrentUser, db: DbSession) -> PanelLayout:
    setting = db.get(AppSetting, SETTING_KEY)
    return PanelLayout(layout=setting.value if setting else None)


@router.put("", status_code=status.HTTP_204_NO_CONTENT)
def save_panel(body: PanelLayout, _: CurrentUser, db: DbSession) -> None:
    if body.layout is None:
        setting = db.get(AppSetting, SETTING_KEY)
        if setting:
            db.delete(setting)
            db.commit()
        return
    if len(json.dumps(body.layout)) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Painel grande demais")
    setting = db.get(AppSetting, SETTING_KEY)
    if setting is None:
        db.add(AppSetting(key=SETTING_KEY, value=body.layout))
    else:
        setting.value = body.layout
    db.commit()
