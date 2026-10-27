"""Conta de envio e preferências dos avisos, guardadas no banco (valem no web e no programa).

A conta (`AppSetting` "email_account") guarda a senha de app criptografada com a mesma chave do
2FA e nunca a devolve pela API. Sem conta no Perfil, usa a do .env (SMTP_*), se houver.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decrypt_field, encrypt_field
from app.db.models import AppSetting

ACCOUNT_KEY = "email_account"
CONFIG_KEY = "email"

# Avisos, na ordem em que aparecem no Perfil. `group`: calendar | event | alert
KINDS: list[dict] = [
    {
        "id": "cycle_ending",
        "group": "calendar",
        "label": "O ciclo está acabando",
        "about": "3 dias antes do fim: quanto ainda dá para gastar e o que ainda vai cair.",
    },
    {
        "id": "cycle_closed",
        "group": "calendar",
        "label": "Resumo do ciclo que fechou",
        "about": "No dia seguinte ao fim: entrou, saiu, sobrou, meta e categorias.",
    },
    {
        "id": "mid_cycle",
        "group": "calendar",
        "label": "Meio do ciclo",
        "about": "Na metade: quanto sobra no ritmo atual e se bate a meta.",
    },
    {
        "id": "card_due",
        "group": "calendar",
        "label": "Fatura vencendo",
        "about": "3 dias antes do vencimento de cada fatura em aberto.",
    },
    {
        "id": "unusual",
        "group": "alert",
        "label": "Compra fora da rotina",
        "about": "Valor muito acima do normal, loja nova cara, cobrança repetida ou no exterior.",
    },
    {
        "id": "category",
        "group": "event",
        "label": "Gasto demais numa área",
        "about": "80% do orçamento, orçamento estourado ou categoria bem acima da média.",
    },
    {
        "id": "wish",
        "group": "event",
        "label": "Dá para comprar um desejo",
        "about": "Quando um desejo passa a caber sem furar a meta, ou bate o preço-alvo.",
    },
    {
        "id": "price_up",
        "group": "event",
        "label": "Conta fixa mais cara",
        "about": "Assinatura ou conta que se repete e veio acima do normal.",
    },
    {
        "id": "installment_end",
        "group": "event",
        "label": "Parcela terminando",
        "about": "Na última parcela: quanto fica livre a partir do próximo ciclo.",
    },
    {
        "id": "cycle_red",
        "group": "alert",
        "label": "Ciclo fechando no vermelho",
        "about": "Quando a previsão do fim do ciclo fica negativa.",
    },
    {
        "id": "bank",
        "group": "alert",
        "label": "Banco desconectado",
        "about": "Conexão com erro, ou 3 dias sem sincronizar.",
    },
]
KIND_IDS = [k["id"] for k in KINDS]
DETAILS = ("full", "totals", "discreet")

DEFAULT_CONFIG: dict = {
    "enabled": True,
    "to": None,  # None: o e-mail da conta do usuário
    "detail": "full",
    "quiet": True,  # 22h às 8h os avisos esperam
    "kinds": {k: True for k in KIND_IDS},
    "baseline_done": False,
}


@dataclass
class Account:
    host: str
    port: int
    user: str
    password: str
    from_name: str
    source: str  # "profile" | "env"


def get_config(db: Session) -> dict:
    setting = db.get(AppSetting, CONFIG_KEY)
    saved = (setting.value or {}) if setting else {}
    config = {**DEFAULT_CONFIG, **saved}
    config["kinds"] = {**DEFAULT_CONFIG["kinds"], **(saved.get("kinds") or {})}
    return config


def save_config(db: Session, changes: dict) -> dict:
    config = get_config(db)
    if "kinds" in changes:
        changes = {**changes, "kinds": {**config["kinds"], **changes["kinds"]}}
    config.update(changes)
    setting = db.get(AppSetting, CONFIG_KEY)
    if setting is None:
        db.add(AppSetting(key=CONFIG_KEY, value=config))
    else:
        setting.value = config
    db.commit()
    return config


def get_account(db: Session) -> Account | None:
    setting = db.get(AppSetting, ACCOUNT_KEY)
    if setting and setting.value:
        v = setting.value
        return Account(
            host=v["host"],
            port=int(v["port"]),
            user=v["user"],
            password=decrypt_field(v["password"]),
            from_name=v.get("from_name") or "Finora",
            source="profile",
        )
    s = get_settings()
    if s.smtp_user and s.smtp_password:
        return Account(
            host=s.smtp_host,
            port=s.smtp_port,
            user=s.smtp_user,
            password=s.smtp_password.replace(" ", ""),
            from_name="Finora",
            source="env",
        )
    return None


def save_account(db: Session, account: Account) -> None:
    value = {
        "host": account.host,
        "port": account.port,
        "user": account.user,
        "password": encrypt_field(account.password),
        "from_name": account.from_name,
    }
    setting = db.get(AppSetting, ACCOUNT_KEY)
    if setting is None:
        db.add(AppSetting(key=ACCOUNT_KEY, value=value))
    else:
        setting.value = value
    db.commit()


def delete_account(db: Session) -> None:
    setting = db.get(AppSetting, ACCOUNT_KEY)
    if setting is not None:
        db.delete(setting)
        db.commit()
