"""Assistente local: status do Ollama, baixar e remover modelos, padrões e chat."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, DbSession
from app.services import assistant, insights, llm

router = APIRouter(tags=["assistente"])


class PullStatus(BaseModel):
    model: str | None
    running: bool
    status: str
    total: int
    completed: int
    error: str | None


class ModelOut(BaseModel):
    name: str
    label: str
    size_gb: float
    memory_gb: float
    note: str
    installed: bool


class StatusOut(BaseModel):
    # Ollama rodando em 127.0.0.1; sem ele, nada de download nem chat
    ollama: bool
    models: list[ModelOut]
    active_model: str
    pull: PullStatus


class ModelIn(BaseModel):
    model: str


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=assistant.MAX_MESSAGE_CHARS)


class ChatIn(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=50)


def _pull_status() -> PullStatus:
    p = llm.pull_state
    return PullStatus(
        model=p.model,
        running=p.running,
        status=p.status,
        total=p.total,
        completed=p.completed,
        error=p.error,
    )


def _catalog_model(name: str) -> dict:
    entry = llm.catalog_entry(name)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modelo fora da lista do app")
    return entry


@router.get("/assistant/status", response_model=StatusOut)
def get_status(_: CurrentUser, db: DbSession) -> StatusOut:
    models = llm.installed()
    return StatusOut(
        ollama=models is not None,
        models=[ModelOut(**m, installed=llm.is_installed(m["name"], models)) for m in llm.CATALOG],
        active_model=llm.get_model(db),
        pull=_pull_status(),
    )


@router.put("/assistant/model", response_model=StatusOut)
def choose_model(body: ModelIn, user: CurrentUser, db: DbSession) -> StatusOut:
    _catalog_model(body.model)
    llm.set_model(db, body.model)
    return get_status(user, db)


@router.post("/assistant/pull", response_model=PullStatus, status_code=status.HTTP_202_ACCEPTED)
def start_pull(body: ModelIn, _: CurrentUser, background: BackgroundTasks) -> PullStatus:
    """Baixa o modelo pelo Ollama em segundo plano; acompanhe em /assistant/status."""
    _catalog_model(body.model)
    if llm.pull_state.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já tem um download em andamento")
    if llm.installed() is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "O Ollama não está aberto")
    background.add_task(llm.pull, body.model)
    return _pull_status()


@router.post("/assistant/pull/cancel", response_model=PullStatus)
def cancel_pull(_: CurrentUser) -> PullStatus:
    llm.pull_state.cancel = True
    return _pull_status()


@router.delete("/assistant/models/{name}", status_code=status.HTTP_204_NO_CONTENT)
def remove_model(name: str, _: CurrentUser) -> None:
    """Desinstala: o Ollama apaga os arquivos do modelo e libera o espaço em disco."""
    _catalog_model(name)
    if llm.pull_state.running and llm.pull_state.model == name:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse modelo ainda está baixando")
    try:
        llm.delete(name)
    except llm.LlmError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None


@router.get("/assistant/insights")
def get_insights(_: CurrentUser, db: DbSession) -> list[dict]:
    """Padrões encontrados pelo código; não precisam do modelo."""
    return insights.find(db, date.today())


@router.post("/assistant/warmup", status_code=status.HTTP_202_ACCEPTED)
def warmup(_: CurrentUser, db: DbSession) -> dict:
    """Carrega o modelo em segundo plano quando a conversa abre: a primeira pergunta sai em
    ~9 s em vez de ~20 s."""
    return {"started": assistant.warm_up(db, date.today())}


@router.post("/assistant/chat")
def chat(body: ChatIn, _: CurrentUser, db: DbSession) -> StreamingResponse:
    """Resposta em streaming (SSE). A conversa não é guardada: o front manda o histórico.
    A sessão do banco fica aberta até o fim do streaming (dependência com yield)."""
    history = [m.model_dump() for m in body.messages]
    return StreamingResponse(
        assistant.answer(db, history, date.today()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
