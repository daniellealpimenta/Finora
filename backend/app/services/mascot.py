"""Mascote escolhido no Perfil (`AppSetting` "mascot"). O nome dele é o do assistente."""

from typing import Literal

from sqlalchemy.orm import Session

from app.db.models import AppSetting

SETTING_KEY = "mascot"

MascotId = Literal["pila", "casco", "guara"]
NAMES: dict[str, str] = {"pila": "Pila", "casco": "Casco", "guara": "Guará"}
DEFAULT: MascotId = "pila"


def get_mascot(db: Session) -> str:
    setting = db.get(AppSetting, SETTING_KEY)
    mascot = (setting.value or {}).get("id") if setting else None
    return mascot if mascot in NAMES else DEFAULT


def mascot_name(db: Session) -> str:
    return NAMES[get_mascot(db)]


def save_mascot(db: Session, mascot: MascotId) -> None:
    setting = db.get(AppSetting, SETTING_KEY)
    if setting is None:
        db.add(AppSetting(key=SETTING_KEY, value={"id": mascot}))
    else:
        setting.value = {**(setting.value or {}), "id": mascot}
    db.commit()
