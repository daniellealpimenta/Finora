from datetime import date

import httpx
import pytest
import respx

from app.integrations.pluggy.client import PluggyClient, PluggyError

BASE = "https://api.pluggy.ai"


@respx.mock
def test_iter_transactions_follows_cursor_and_reuses_api_key():
    auth = respx.post(f"{BASE}/auth").mock(return_value=httpx.Response(200, json={"apiKey": "k"}))
    route = respx.get(f"{BASE}/v2/transactions").mock(
        side_effect=[
            httpx.Response(
                200, json={"results": [{"id": "a"}], "next": "?accountId=acc-1&after=CURSOR%3D"}
            ),
            httpx.Response(200, json={"results": [{"id": "b"}], "next": None}),
        ]
    )

    with PluggyClient() as pluggy:
        txs = list(pluggy.iter_transactions("acc-1", date_from=date(2026, 1, 1)))

    assert [t["id"] for t in txs] == ["a", "b"]
    assert auth.call_count == 1
    first = route.calls[0].request
    assert first.headers["X-API-KEY"] == "k"
    assert first.url.params["dateFrom"] == "2026-01-01"
    assert route.calls[1].request.url.params["after"] == "CURSOR="


@respx.mock
def test_auth_failure_raises():
    respx.post(f"{BASE}/auth").mock(return_value=httpx.Response(401, json={"message": "no"}))
    with PluggyClient() as pluggy, pytest.raises(PluggyError):
        pluggy.get_item("item-1")


def test_connect_token_requires_auth(client):
    assert client.post("/pluggy/connect-token").status_code == 401
