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
