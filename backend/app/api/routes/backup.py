"""Levar os dados para outro computador (services/backup.py): exportar e importar o `.finora`."""

import re
import subprocess
import sys
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from platformdirs import user_downloads_dir
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.services import backup

router = APIRouter(prefix="/backup", tags=["backup"])

MAX_UPLOAD = 300 * 1024 * 1024
# Só os arquivos que o próprio Finora gerou podem ser mostrados no Finder/Explorer
_OWN_FILE = re.compile(r"^Finora-[\w.-]+\.finora$")


class ExportIn(BaseModel):
    password: str


class ExportOut(BaseModel):
    filename: str
    folder: str


class RevealIn(BaseModel):
    filename: str


class BackupInfo(BaseModel):
    created_at: str
    device: str
    system: str
    app_version: str
    owner: str | None
    compatible: bool
    kept_as: str | None = None


def info_out(header: dict) -> BackupInfo:
    return BackupInfo(
        created_at=header.get("created_at", ""),
        device=header.get("device", "computador"),
        system=header.get("system", ""),
        app_version=header.get("app_version", "?"),
        owner=header.get("owner"),
        compatible=bool(header.get("compatible", True)),
        kept_as=header.get("kept_as"),
    )


def _downloads() -> Path:
    folder = Path(user_downloads_dir())
    folder.mkdir(parents=True, exist_ok=True)
    return folder


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Arquivo grande demais")
    return data


@router.post("/export", response_model=ExportOut)
def export_data(body: ExportIn, user: CurrentUser) -> ExportOut:
    """Grava o `.finora` na pasta Downloads (o navegador do programa não baixa arquivos)."""
    try:
        data, header = backup.export(body.password, user.username or user.email.split("@")[0])
    except backup.BackupError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    device = re.sub(r"[^\w-]+", "-", header["device"]).strip("-")[:40] or "computador"
    stamp = header["created_at"][:16].replace(":", "").replace("T", "-")
    filename = f"Finora-{device}-{stamp}.finora"
    folder = _downloads()
    (folder / filename).write_bytes(data)
    return ExportOut(filename=filename, folder=str(folder))


@router.post("/reveal", status_code=status.HTTP_204_NO_CONTENT)
def reveal(body: RevealIn, _: CurrentUser) -> None:
    """Abre a pasta Downloads com o arquivo selecionado."""
    path = _downloads() / body.filename
    if not _OWN_FILE.match(body.filename) or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Arquivo não encontrado")
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(path)], check=False)  # noqa: S603, S607
    elif sys.platform == "win32":
        subprocess.run(["explorer", f"/select,{path}"], check=False)  # noqa: S603, S607
    else:
        subprocess.run(["xdg-open", str(path.parent)], check=False)  # noqa: S603, S607


@router.post("/inspect", response_model=BackupInfo)
async def inspect(file: Annotated[UploadFile, File()]) -> BackupInfo:
    """De onde e de quando é o arquivo (o cabeçalho não pede senha nem tem dado financeiro)."""
    try:
        return info_out(backup.read_header(await read_upload(file)))
    except backup.BackupError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None


@router.post("/import", response_model=BackupInfo)
async def import_data(
    file: Annotated[UploadFile, File()],
    password: Annotated[str, Form()],
    _: CurrentUser,
    db: DbSession,
) -> BackupInfo:
    """Substitui os dados deste computador pelos do arquivo (o atual fica guardado)."""
    db.close()  # a sessão que validou o login não pode segurar o banco que vai ser trocado
    try:
        return info_out(backup.restore(await read_upload(file), password))
    except backup.BackupError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
