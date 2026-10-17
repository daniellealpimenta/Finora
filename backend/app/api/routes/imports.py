from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.db.models import Account, AccountType, Category, CategoryKind, Transaction
from app.db.models import TransactionSource as Source
from app.integrations.importers.ofx import OfxError, parse_ofx
from app.services.categories import Categorizer, ensure_categories

router = APIRouter(prefix="/import", tags=["importação"])

MAX_OFX_BYTES = 10 * 1024 * 1024


class ImportResult(BaseModel):
    account_id: int
    account_name: str
    created: int
    skipped: int


@router.post("/ofx", response_model=ImportResult)
async def import_ofx(
    _: CurrentUser,
    db: DbSession,
    file: Annotated[UploadFile, File()],
    account_id: Annotated[int | None, Form()] = None,
    account_name: Annotated[str | None, Form()] = None,
) -> ImportResult:
    """Importa um extrato OFX. Sem `account_id`, cria/reusa uma conta pelo número do OFX.

    Reimportar o mesmo arquivo não duplica nada (deduplicação pelo FITID).
    """
    raw = await file.read(MAX_OFX_BYTES + 1)
    if len(raw) > MAX_OFX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Arquivo maior que 10 MB")
    try:
        statement = parse_ofx(raw)
    except OfxError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    if account_id is not None:
        account = db.get(Account, account_id)
        if account is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada")
    else:
        external_id = f"ofx:{statement.bank_id or '?'}:{statement.account_id or file.filename}"
        account = db.scalar(select(Account).where(Account.external_id == external_id))
        if account is None:
            suffix = (statement.account_id or "")[-4:]
            account = Account(
                external_id=external_id,
                name=account_name or f"Importada {statement.bank_id or ''} {suffix}".strip(),
                type=AccountType.CREDIT_CARD if statement.is_credit_card else AccountType.CHECKING,
            )
            db.add(account)
            db.flush()
    if statement.balance is not None and account.connection_id is None:
        account.balance = statement.balance

    ensure_categories(db)
    categorizer = Categorizer(db)
    kinds = {c.id: c.kind for c in db.scalars(select(Category))}
    existing = set(
        db.scalars(select(Transaction.external_id).where(Transaction.account_id == account.id))
    )
    created = skipped = 0
    for item in statement.transactions:
        if item.fitid in existing:
            skipped += 1
            continue
        existing.add(item.fitid)
        category_id = categorizer.categorize(item.description, None, item.amount)
        db.add(
            Transaction(
                account_id=account.id,
                external_id=item.fitid,
                source=Source.OFX,
                date=item.date,
                amount=item.amount,
                description=item.description,
                category_id=category_id,
                is_transfer=kinds.get(category_id) == CategoryKind.TRANSFER,
            )
        )
        created += 1
    db.commit()
    return ImportResult(
        account_id=account.id, account_name=account.name, created=created, skipped=skipped
    )
