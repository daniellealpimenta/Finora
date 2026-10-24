import json
from datetime import date
from decimal import Decimal

import httpx
import pytest
import respx
from sqlalchemy import select

from app.db.models import (
    Account,
    AccountType,
    Category,
    Transaction,
    TransactionSource,
)
from app.services import assistant, insights, llm
from app.services.categories import ensure_categories

OLLAMA = "http://127.0.0.1:11434"
TODAY = date(2026, 10, 15)


def _lines(*events: dict) -> bytes:
    return "\n".join(json.dumps(e) for e in events).encode()


def _sse(body: str) -> list[dict]:
    return [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]


@pytest.fixture(autouse=True)
def fresh_pull_state(monkeypatch):
    monkeypatch.setattr(llm, "pull_state", llm.PullState())


@pytest.fixture
def data(db):
    """Mercado subindo jun→set (100, 200, 300, 400) e a Netflix que passou de 40 para 50."""
    ensure_categories(db)
    cat = {c.key: c.id for c in db.scalars(select(Category))}
    checking = Account(name="Conta", type=AccountType.CHECKING, balance=Decimal("5000"))
    db.add(checking)
    db.flush()
    n = 0

    def add(d, amount, key, desc):
        nonlocal n
        n += 1
        db.add(
            Transaction(
                account_id=checking.id,
                external_id=f"t{n}",
                source=TransactionSource.MANUAL,
                date=d,
                amount=Decimal(amount),
                description=desc,
                category_id=cat[key],
            )
        )

    for month, groceries in zip((6, 7, 8, 9), (100, 200, 300, 400), strict=True):
        add(date(2026, month, 5), "4000", "salary", "SALARIO")
        add(date(2026, month, 12), f"-{groceries}", "groceries", f"MERCADO {month}")
        add(date(2026, month, 3), "-40", "subscriptions", "NETFLIX")
    add(date(2026, 10, 3), "-50", "subscriptions", "NETFLIX")
    add(date(2026, 10, 5), "4000", "salary", "SALARIO")
    for day in range(1, 10):
        add(date(2026, 10, day), "-12", "transport", "UBER TRIP")
    db.commit()


# --- padrões ---------------------------------------------------------------------


def test_insights_find_rising_category_price_up_and_frequent_merchant(db, data):
    found = {i["kind"]: i for i in insights.find(db, TODAY)}

    assert found["category_rising"]["detail"].startswith("R$ 100,00 → R$ 200,00")
    assert "R$ 50,00" in found["price_up"]["detail"] and "R$ 40,00" in found["price_up"]["detail"]
    assert found["frequent"]["title"] == "9 compras em UBER TRIP"
    # Os de atenção vêm primeiro
    severities = [i["severity"] for i in insights.find(db, TODAY)]
    assert severities == sorted(severities, key=lambda s: {"warn": 0, "info": 1, "good": 2}[s])


def test_brl_formats_like_the_app():
    assert insights.brl(Decimal("1234.5")) == "R$ 1.234,50"
    assert insights.brl(Decimal("-12")) == "−R$ 12,00"


# --- ferramentas -----------------------------------------------------------------


def test_search_tool_filters_and_sums(db, data):
    result = json.loads(
        assistant.run_tool(db, TODAY, "buscar_transacoes", {"texto": "uber", "limite": 3})
    )
    assert (result["encontradas"], result["mostrando"]) == (9, 3)
    assert Decimal(result["total"]) == Decimal("-108")

    bad = json.loads(assistant.run_tool(db, TODAY, "buscar_transacoes", {"ciclo": "outubro"}))
    assert "AAAA-MM" in bad["erro"]
    assert "não existe" in json.loads(assistant.run_tool(db, TODAY, "apagar_tudo", {}))["erro"]


def test_think_blocks_are_removed_even_when_split():
    f = assistant._ThinkFilter()
    out = f.feed("<thi") + f.feed("nk>pensando…</th") + f.feed("ink>\nOlá, ") + f.feed("tudo bem")
    assert out + f.flush() == "Olá, tudo bem"


# --- Ollama ----------------------------------------------------------------------


@respx.mock
def test_status_reports_ollama_and_installed_models(client, auth_headers):
    respx.get(f"{OLLAMA}/api/tags").mock(side_effect=httpx.ConnectError("off"))
    off = client.get("/assistant/status", headers=auth_headers).json()
    assert off["ollama"] is False and off["active_model"] == "qwen3:8b"

    respx.get(f"{OLLAMA}/api/tags").mock(
        return_value=httpx.Response(200, json={"models": [{"name": "qwen3:8b", "size": 5}]})
    )
    on = client.get("/assistant/status", headers=auth_headers).json()
    assert on["ollama"] is True
    assert {m["name"]: m["installed"] for m in on["models"]} == {
        "qwen3:8b": True,
        "qwen3:4b": False,
        "qwen3:14b": False,
    }


@respx.mock
def test_pull_tracks_progress_across_layers():
    respx.post(f"{OLLAMA}/api/pull").mock(
        return_value=httpx.Response(
            200,
            content=_lines(
                {"status": "pulling manifest"},
                {"status": "pulling a", "digest": "a", "total": 100, "completed": 40},
                {"status": "pulling b", "digest": "b", "total": 50, "completed": 50},
                {"status": "pulling a", "digest": "a", "total": 100, "completed": 100},
                {"status": "success"},
            ),
        )
    )
    llm.pull("qwen3:8b")
    p = llm.pull_state
    assert (p.running, p.status, p.total, p.completed, p.error) == (
        False,
        "success",
        150,
        150,
        None,
    )


@respx.mock
def test_pull_reports_ollama_error():
    respx.post(f"{OLLAMA}/api/pull").mock(
        return_value=httpx.Response(200, content=_lines({"error": "sem espaço em disco"}))
    )
    llm.pull("qwen3:8b")
    assert llm.pull_state.error == "sem espaço em disco"


@respx.mock
def test_only_catalog_models_can_be_pulled_or_removed(client, auth_headers):
    delete = respx.delete(f"{OLLAMA}/api/delete").mock(return_value=httpx.Response(200))
    respx.get(f"{OLLAMA}/api/tags").mock(return_value=httpx.Response(200, json={"models": []}))
    other = client.request("DELETE", "/assistant/models/llama3:70b", headers=auth_headers)
    assert other.status_code == 404 and not delete.called

    assert client.delete("/assistant/models/qwen3:8b", headers=auth_headers).status_code == 204
    assert json.loads(delete.calls[0].request.content) == {"model": "qwen3:8b"}

    pull = client.post("/assistant/pull", json={"model": "llama3:70b"}, headers=auth_headers)
    assert pull.status_code == 404
    chosen = client.put("/assistant/model", json={"model": "qwen3:4b"}, headers=auth_headers)
    assert chosen.json()["active_model"] == "qwen3:4b"


@respx.mock
def test_chat_calls_tool_then_streams_answer(client, auth_headers, data):
    route = respx.post(f"{OLLAMA}/api/chat").mock(
        side_effect=[
            httpx.Response(
                200,
                content=_lines(
                    {
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [{"function": {"name": "previsao", "arguments": {}}}],
                        },
                        "done": False,
                    },
                    {"message": {"role": "assistant", "content": ""}, "done": True},
                ),
            ),
            httpx.Response(
                200,
                content=_lines(
                    {"message": {"role": "assistant", "content": "Cabe, "}, "done": False},
                    {"message": {"role": "assistant", "content": "com folga."}, "done": True},
                ),
            ),
        ]
    )
    resp = client.post(
        "/assistant/chat",
        json={"messages": [{"role": "user", "content": "Posso comprar um fone de R$ 200?"}]},
        headers=auth_headers,
    )
    events = _sse(resp.text)

    assert [e["type"] for e in events] == ["tool", "text", "text", "done"]
    assert events[0]["label"] == "Calculando a previsão"
    assert "".join(e.get("delta", "") for e in events) == "Cabe, com folga."
    # A segunda rodada leva o resultado da ferramenta, calculado pelo app
    second = json.loads(route.calls[1].request.content)
    tool_msg = second["messages"][-1]
    assert tool_msg["role"] == "tool" and "spendable" in tool_msg["content"]
    assert second["think"] is False and second["messages"][0]["role"] == "system"


@respx.mock
def test_chat_explains_when_ollama_is_off(client, auth_headers, data):
    respx.post(f"{OLLAMA}/api/chat").mock(side_effect=httpx.ConnectError("off"))
    body = {"messages": [{"role": "user", "content": "oi"}]}
    resp = client.post("/assistant/chat", json=body, headers=auth_headers)
    assert _sse(resp.text) == [
        {"type": "error", "message": "Não deu para falar com o Ollama. Ele está aberto?"}
    ]
