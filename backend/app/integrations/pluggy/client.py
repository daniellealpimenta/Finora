"""Cliente mínimo da API da Pluggy (https://docs.pluggy.ai).

O segredo da Pluggy só existe no backend. Apps cliente (web/iOS) recebem um
connect token de curta duração gerado por `create_connect_token`.
"""

import time
from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx

from app.core.config import get_settings

# A apiKey da Pluggy expira em 2h; renovamos com folga.
_API_KEY_TTL_SECONDS = 100 * 60


class PluggyError(RuntimeError):
    pass


class PluggyClient:
    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        base_url: str | None = None,
        http: httpx.Client | None = None,
    ) -> None:
        settings = get_settings()
        self._client_id = client_id or settings.pluggy_client_id
        self._client_secret = client_secret or settings.pluggy_client_secret
        if not self._client_id or not self._client_secret:
            raise PluggyError("PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados")
        self._http = http or httpx.Client(base_url=base_url or settings.pluggy_base_url, timeout=30)
        self._api_key: str | None = None
        self._api_key_expires_at = 0.0

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "PluggyClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # --- auth -----------------------------------------------------------------

    def _ensure_api_key(self) -> str:
        if self._api_key and time.monotonic() < self._api_key_expires_at:
            return self._api_key
        resp = self._http.post(
            "/auth", json={"clientId": self._client_id, "clientSecret": self._client_secret}
        )
        if resp.status_code != 200:
            raise PluggyError(f"Falha na autenticação Pluggy ({resp.status_code}): {resp.text}")
        self._api_key = resp.json()["apiKey"]
        self._api_key_expires_at = time.monotonic() + _API_KEY_TTL_SECONDS
        return self._api_key

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        headers = {"X-API-KEY": self._ensure_api_key()}
        resp = self._http.request(method, path, headers=headers, **kwargs)
        if resp.status_code >= 400:
            raise PluggyError(f"{method} {path} -> {resp.status_code}: {resp.text}")
        return resp.json()

    # --- endpoints ------------------------------------------------------------

    def create_connect_token(self, item_id: str | None = None) -> str:
        body = {"itemId": item_id} if item_id else {}
        return self._request("POST", "/connect_token", json=body)["accessToken"]

    def get_item(self, item_id: str) -> dict[str, Any]:
        return self._request("GET", f"/items/{item_id}")

    def list_accounts(self, item_id: str) -> list[dict[str, Any]]:
        return self._request("GET", "/accounts", params={"itemId": item_id})["results"]

    def delete_item(self, item_id: str) -> None:
        """Remove o item na Pluggy (encerra o acesso aos dados dessa conexão)."""
        self._request("DELETE", f"/items/{item_id}")

    def iter_transactions(
        self,
        account_id: str,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Transações via GET /v2/transactions (paginação por cursor).

        O endpoint v1 (/transactions, por página) é descontinuado após 2026-12-31.
        `next` vem pronto como query string ("?accountId=...&after=...").
        """
        params: dict[str, Any] = {"accountId": account_id}
        if date_from:
            params["dateFrom"] = date_from.isoformat()
        if date_to:
            params["dateTo"] = date_to.isoformat()
        data = self._request("GET", "/v2/transactions", params=params)
        while True:
            yield from data["results"]
            next_query = data.get("next")
            if not next_query:
                break
            data = self._request("GET", f"/v2/transactions{next_query}")
