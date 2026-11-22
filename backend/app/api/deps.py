from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import DEVICE_TOKEN_PREFIX, decode_access_token
from app.db.models import User
from app.db.session import get_db
from app.services import devices

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(db: DbSession, token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Celular pareado: token de aparelho (ver app/services/devices.py)
    if token.startswith(DEVICE_TOKEN_PREFIX):
        user = devices.user_for_token(db, token)
        if user is None:
            raise unauthorized
        return user
    try:
        user_id = int(decode_access_token(token))
    except (jwt.PyJWTError, ValueError):
        raise unauthorized from None
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
