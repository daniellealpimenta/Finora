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
