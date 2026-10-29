import sys

import httpx
import pytest

from app.services import updates


@pytest.fixture
def desktop(monkeypatch):
    """Como no programa instalado (.app/.exe), no Mac, com a versão 0.1.0 e sem cache."""
    monkeypatch.setattr(updates, "is_desktop", lambda: True)
    monkeypatch.setattr(updates, "current_version", lambda: "0.1.0")
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(updates, "_cache", None)


def _github(monkeypatch, tag: str | None, calls: list | None = None) -> None:
    def fake_get(url, **kwargs):
        if calls is not None:
            calls.append(url)
        if tag is None:
            raise httpx.ConnectError("sem internet")
        return httpx.Response(200, json={"tag_name": tag}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)


def test_current_version_reads_pyproject():
    assert updates._parse(updates.current_version())


def test_newer_release_offers_this_system_installer(client, auth_headers, desktop, monkeypatch):
    _github(monkeypatch, "v0.2.0")
    body = client.get("/updates", headers=auth_headers).json()
    assert body["available"] is True
    assert body["latest"] == "0.2.0"
    assert body["download_url"].endswith("/download/v0.2.0/Finora-macOS.dmg")

    monkeypatch.setattr(sys, "platform", "win32")
    body = client.get("/updates", headers=auth_headers).json()
    assert body["download_url"].endswith("/download/v0.2.0/Finora-Windows-Setup.exe")


@pytest.mark.parametrize("tag", ["v0.1.0", "v0.0.9", None])
def test_no_notice_when_same_older_or_offline(client, auth_headers, desktop, monkeypatch, tag):
    _github(monkeypatch, tag)
    assert client.get("/updates", headers=auth_headers).json()["available"] is False


def test_compares_versions_as_numbers(client, auth_headers, desktop, monkeypatch):
    monkeypatch.setattr(updates, "current_version", lambda: "0.9.0")
    _github(monkeypatch, "v0.10.0")
    assert client.get("/updates", headers=auth_headers).json()["available"] is True


def test_dismiss_hides_only_that_version(client, auth_headers, desktop, monkeypatch):
    _github(monkeypatch, "v0.2.0")
    res = client.post("/updates/dismiss", json={"version": "0.2.0"}, headers=auth_headers)
    assert res.status_code == 204
    assert client.get("/updates", headers=auth_headers).json()["available"] is False

    monkeypatch.setattr(updates, "_cache", None)
    _github(monkeypatch, "v0.3.0")
    assert client.get("/updates", headers=auth_headers).json()["available"] is True


def test_github_is_asked_once_per_cache_window(client, auth_headers, desktop, monkeypatch):
    calls: list = []
    _github(monkeypatch, "v0.2.0", calls)
    for _ in range(3):
        client.get("/updates", headers=auth_headers)
    assert len(calls) == 1


def test_web_mode_never_asks_github(client, auth_headers, monkeypatch):
    calls: list = []
    _github(monkeypatch, "v9.0.0", calls)
    assert client.get("/updates", headers=auth_headers).json()["available"] is False
    assert calls == []


def test_requires_login(client):
    assert client.get("/updates").status_code == 401
