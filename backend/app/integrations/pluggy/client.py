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


class PluggyAccessError(PluggyError):
    """A Pluggy recusou o acesso (401/403): chave errada, aplicação apagada ou conta bloqueada.
    Vale para todos os bancos, então o sync para e avisa em vez de tentar um por um."""


class PluggyCredentialsError(PluggyAccessError):
    """Client ID/Secret recusados pela Pluggy."""


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
        if 400 <= resp.status_code < 500:
            raise PluggyCredentialsError(
                f"Falha na autenticação Pluggy ({resp.status_code}): {resp.text}"
            )
        if resp.status_code != 200:
            raise PluggyError(f"Falha na autenticação Pluggy ({resp.status_code}): {resp.text}")
        self._api_key = resp.json()["apiKey"]
        self._api_key_expires_at = time.monotonic() + _API_KEY_TTL_SECONDS
        return self._api_key

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        headers = {"X-API-KEY": self._ensure_api_key()}
        resp = self._http.request(method, path, headers=headers, **kwargs)
        if resp.status_code in (401, 403):
            raise PluggyAccessError(f"{method} {path} -> {resp.status_code}: {resp.text}")
        if resp.status_code >= 400:
            raise PluggyError(f"{method} {path} -> {resp.status_code}: {resp.text}")
        return resp.json()

    def check_credentials(self) -> None:
        """Lança PluggyCredentialsError se a Pluggy recusar o Client ID/Secret."""
        self._ensure_api_key()

    # --- endpoints ------------------------------------------------------------

    def create_connect_token(self, item_id: str | None = None) -> str:
        body = {"itemId": item_id} if item_id else {}
        return self._request("POST", "/connect_token", json=body)["accessToken"]

    def get_item(self, item_id: str) -> dict[str, Any]:
        return self._request("GET", f"/items/{item_id}")

    def list_accounts(self, item_id: str) -> list[dict[str, Any]]:
        return self._request("GET", "/accounts", params={"itemId": item_id})["results"]

    def list_investments(self, item_id: str) -> list[dict[str, Any]]:
        """Caixinhas, cofrinhos, CDBs, fundos... do item (GET /investments, paginado)."""
        results: list[dict[str, Any]] = []
        page = 1
        while True:
            data = self._request(
                "GET", "/investments", params={"itemId": item_id, "page": page, "pageSize": 500}
            )
            results.extend(data["results"])
            if page >= (data.get("totalPages") or 1):
                return results
            page += 1

    def list_bills(self, account_id: str) -> list[dict[str, Any]]:
        """Faturas fechadas de um cartão (GET /bills, paginado), mais recente primeiro."""
        results: list[dict[str, Any]] = []
        page = 1
        while True:
            data = self._request(
                "GET", "/bills", params={"accountId": account_id, "page": page, "pageSize": 100}
            )
            results.extend(data["results"])
            if page >= (data.get("totalPages") or 1):
                return results
            page += 1

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
