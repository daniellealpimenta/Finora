"""Cache do frontend estático: páginas sempre revalidadas, arquivos com hash para sempre."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import FrontendFiles


def _client(tmp_path) -> TestClient:
    (tmp_path / "index.html").write_text("<p>início</p>")
    (tmp_path / "perfil").mkdir()
    (tmp_path / "perfil" / "index.html").write_text("<p>perfil</p>")
    (tmp_path / "perfil" / "index.txt").write_text("rsc")
    static = tmp_path / "_next" / "static" / "chunks"
    static.mkdir(parents=True)
    (static / "page-abc123.js").write_text("js")
    app = FastAPI()
    app.mount("/", FrontendFiles(directory=tmp_path, html=True), name="frontend")
    return TestClient(app)


def test_pages_are_revalidated(tmp_path):
    client = _client(tmp_path)
    for url in ("/", "/perfil/", "/perfil/index.txt"):
        res = client.get(url)
        assert res.status_code == 200
        assert res.headers["cache-control"] == "no-cache"
        assert res.headers.get("etag")


def test_hashed_assets_are_immutable(tmp_path):
    res = _client(tmp_path).get("/_next/static/chunks/page-abc123.js")
    assert res.status_code == 200
    assert "immutable" in res.headers["cache-control"]


def test_unchanged_page_answers_304(tmp_path):
    client = _client(tmp_path)
    etag = client.get("/perfil/").headers["etag"]
    res = client.get("/perfil/", headers={"If-None-Match": etag})
    assert res.status_code == 304
