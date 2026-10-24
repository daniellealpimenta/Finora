import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    "value,expected",
    [
        (r"C:\Users\eu\mf.db", "sqlite:///C:/Users/eu/mf.db"),
        ("sqlite:///C:/Users/eu/mf.db", "sqlite:///C:/Users/eu/mf.db"),
        ("sqlite://", "sqlite://"),
    ],
)
def test_database_url_accepts_plain_path(value, expected):
    assert Settings(database_url=value).database_url == expected


def test_windows_path_is_refused_outside_windows(monkeypatch):
    from app.db import session

    monkeypatch.setattr(session.os, "name", "posix")
    with pytest.raises(RuntimeError, match="caminho do Windows"):
        session._refuse_windows_path_elsewhere("C:/Users/eu/mf.db")
    session._refuse_windows_path_elsewhere("/Users/eu/Library/mf.db")  # caminho normal passa


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1:11434", "http://localhost:11434/", "http://[::1]:11434"]
)
def test_llm_url_accepts_this_machine(url):
    assert Settings(llm_base_url=url).llm_base_url == url.rstrip("/")


@pytest.mark.parametrize(
    "url", ["https://integrate.api.nvidia.com/v1", "http://192.168.0.10:11434", "http://10.0.0.2"]
)
def test_llm_url_refuses_anything_off_the_machine(url):
    # Dados financeiros não saem do computador, nem com um .env errado
    with pytest.raises(ValueError, match="esta máquina"):
        Settings(llm_base_url=url)
