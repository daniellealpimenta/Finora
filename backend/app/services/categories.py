"""Catálogo de categorias do sistema e categorização automática.

Ordem de decisão para uma transação (a primeira que resolver vence):
  1. Escolha manual do usuário (`user_categorized`): nunca é sobrescrita
  2. Regras do usuário (`category_rules`): "descrição contém padrão"
  3. Categoria da Pluggy (`categoryId`), traduzida pelo mapa abaixo
  4. Fallback: "Outros" (saída) ou "Outras receitas" (entrada)
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Category, CategoryKind, CategoryRule

EXPENSE, INCOME, TRANSFER = CategoryKind.EXPENSE, CategoryKind.INCOME, CategoryKind.TRANSFER


@dataclass(frozen=True)
class CategoryDef:
    key: str
    name: str
    kind: CategoryKind


CATALOG: list[CategoryDef] = [
    # Receitas
    CategoryDef("salary", "Salário", INCOME),
    CategoryDef("extra_income", "Renda extra", INCOME),
    CategoryDef("investment_income", "Rendimentos", INCOME),
    CategoryDef("transfers_in", "Transferências recebidas", INCOME),
    CategoryDef("other_income", "Outras receitas", INCOME),
    # Movimentações que não são gasto nem receita
    CategoryDef("own_transfer", "Transferência entre contas", TRANSFER),
    CategoryDef("card_payment", "Pagamento de fatura", TRANSFER),
    CategoryDef("investments", "Investimentos", TRANSFER),
    # Despesas
    CategoryDef("housing", "Moradia", EXPENSE),
    CategoryDef("utilities", "Contas da casa", EXPENSE),
    CategoryDef("groceries", "Supermercado", EXPENSE),
    CategoryDef("eating_out", "Restaurantes e bares", EXPENSE),
    CategoryDef("delivery", "Delivery", EXPENSE),
    CategoryDef("transport", "Transporte", EXPENSE),
    CategoryDef("ride_hailing", "Táxi e apps", EXPENSE),
    CategoryDef("fuel", "Combustível", EXPENSE),
    CategoryDef("vehicle", "Veículo", EXPENSE),
    CategoryDef("health", "Saúde", EXPENSE),
    CategoryDef("pharmacy", "Farmácia", EXPENSE),
    CategoryDef("fitness", "Academia e bem-estar", EXPENSE),
    CategoryDef("education", "Educação", EXPENSE),
    CategoryDef("telecom", "Internet e celular", EXPENSE),
    CategoryDef("subscriptions", "Assinaturas e streaming", EXPENSE),
    CategoryDef("shopping", "Compras", EXPENSE),
    CategoryDef("pets", "Pets", EXPENSE),
    CategoryDef("travel", "Viagens", EXPENSE),
    CategoryDef("leisure", "Lazer", EXPENSE),
    CategoryDef("gambling", "Apostas", EXPENSE),
    CategoryDef("taxes_fees", "Impostos e tarifas", EXPENSE),
    CategoryDef("debt", "Juros e empréstimos", EXPENSE),
    CategoryDef("insurance", "Seguros", EXPENSE),
    CategoryDef("donations", "Doações", EXPENSE),
    CategoryDef("transfers_out", "Pix e transferências enviadas", EXPENSE),
    CategoryDef("other", "Outros", EXPENSE),
]

# categoryId da Pluggy (GET /categories) -> chave do catálogo.
# Resolvido pelo prefixo mais longo: "19050001" casa antes de "190500" e de "19".
PLUGGY_PREFIX_MAP: dict[str, str] = {
    "0101": "salary",
    "0102": "extra_income",
    "0103": "extra_income",
    "0104": "extra_income",
    "0105": "extra_income",
    "01": "extra_income",
    "02": "debt",
    "0306": "investment_income",
    "03": "investments",
    "04": "own_transfer",
    "0510": "card_payment",
    "05": "transfers_out",
    "06": "other",
    "070100": "telecom",
    "070200": "education",
    "070300": "fitness",
    "070400": "leisure",
    "07": "other",
    "0803": "pets",
    "08": "shopping",
    "09": "subscriptions",
    "10": "groceries",
    "1102": "delivery",
    "11": "eating_out",
    "12": "travel",
    "13": "donations",
    "14": "gambling",
    "15": "taxes_fees",
    "16": "taxes_fees",
    "1701": "housing",
    "1702": "utilities",
    "1704": "taxes_fees",
    "17": "housing",
    "1802": "pharmacy",
    "18": "health",
    "1901": "ride_hailing",
    "19050001": "fuel",
    "1905": "vehicle",
    "19": "transport",
    "20": "insurance",
    "21": "leisure",
}

# Categorias de saída que, numa entrada de dinheiro, viram outra coisa
_CREDIT_OVERRIDES = {"transfers_out": "transfers_in", "other": "other_income"}


def pluggy_category_key(category_id: str | None, is_credit: bool) -> str | None:
    if not category_id:
        return None
    for length in range(len(category_id), 1, -1):
        key = PLUGGY_PREFIX_MAP.get(category_id[:length])
        if key:
            return _CREDIT_OVERRIDES.get(key, key) if is_credit else key
    return None


def ensure_categories(db: Session) -> None:
    """Cria (idempotente) as categorias do catálogo. Não altera nomes editados."""
    existing = set(db.scalars(select(Category.key).where(Category.key.is_not(None))))
    for c in CATALOG:
        if c.key not in existing:
            db.add(Category(key=c.key, name=c.name, kind=c.kind))
    db.commit()


class Categorizer:
    """Carrega categorias e regras uma vez e categoriza muitas transações."""

    def __init__(self, db: Session) -> None:
        self.by_key = {c.key: c.id for c in db.scalars(select(Category)) if c.key}
        self.rules = [
            (r.pattern.casefold(), r.category_id)
            for r in db.scalars(
                select(CategoryRule).order_by(CategoryRule.priority.desc(), CategoryRule.id.desc())
            )
        ]

    def categorize(
        self,
        description: str,
        provider_category_id: str | None,
        amount,
        merchant: str | None = None,
    ) -> int | None:
        # Regras comparam descrição e estabelecimento (como em PATCH /transactions)
        texts = [description.casefold(), (merchant or "").casefold()]
        for pattern, category_id in self.rules:
            if pattern and any(pattern in text for text in texts):
                return category_id
        is_credit = amount > 0
        key = pluggy_category_key(provider_category_id, is_credit)
        if key is None:
            key = "other_income" if is_credit else "other"
        return self.by_key.get(key)
