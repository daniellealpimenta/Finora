from decimal import Decimal

import httpx
import pytest
import respx

from app.services import wishlist

JSON_LD_PAGE = """
<html><head>
<title>Fone XYZ | Loja</title>
<meta property="og:site_name" content="Loja Boa">
<script type="application/ld+json">
{"@context": "https://schema.org", "@graph": [
  {"@type": "BreadcrumbList"},
  {"@type": "Product", "name": "Fone XYZ", "image": ["/img/fone.jpg"],
   "offers": {"@type": "Offer", "price": "1299.90", "priceCurrency": "BRL"}}
]}
</script>
</head><body></body></html>
"""

OG_PAGE = """
<html><head>
<meta property="og:title" content="Cadeira Gamer">
<meta property="og:image" content="https://cdn.loja.com/cadeira.png">
<meta property="product:price:amount" content="899,00">
</head></html>
"""


@pytest.fixture(autouse=True)
def public_dns(monkeypatch):
    """Sem rede nos testes: todo host resolve para um IP público, exceto os literais e o
    localhost (senão o teste do link bloqueado tentaria abrir o backend que estiver rodando)."""
    real = wishlist._resolve

    def resolve(host: str) -> list[str]:
        if host.replace(".", "").isdigit() or ":" in host or host == "localhost":
            return real(host)
        return ["93.184.216.34"]

    monkeypatch.setattr(wishlist, "_resolve", resolve)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1299.90", "1299.90"),
        ("1.299,90", "1299.90"),
        ("R$ 1.299", "1299.00"),
        ("1,299.90", "1299.90"),
        (49.9, "49.90"),
        ("grátis", None),
        ("0", None),
    ],
)
def test_parse_price_handles_brazilian_and_us_formats(raw, expected):
    assert wishlist.parse_price(raw) == (Decimal(expected) if expected else None)


def test_parse_product_prefers_json_ld():
    p = wishlist.parse_product(JSON_LD_PAGE, "https://www.loja.com/p/fone")
    assert p["name"] == "Fone XYZ"
    assert p["price"] == Decimal("1299.90")
    assert p["image_url"] == "https://www.loja.com/img/fone.jpg"
    assert p["store"] == "Loja Boa"


def test_parse_product_falls_back_to_open_graph_and_title():
    p = wishlist.parse_product(OG_PAGE, "https://www.loja.com/cadeira")
    assert (p["name"], p["price"], p["store"]) == ("Cadeira Gamer", Decimal("899.00"), "loja.com")

    empty = wishlist.parse_product("<title> Só o título </title>", "https://x.com/a")
    assert (empty["name"], empty["price"], empty["image_url"]) == ("Só o título", None, None)


@pytest.mark.parametrize(
    "url",
    ["http://127.0.0.1:8000/auth/me", "http://192.168.0.1/", "http://[::1]/", "file:///etc/passwd"],
)
def test_fetch_refuses_local_network_and_other_schemes(url):
    with pytest.raises(wishlist.ProductFetchError):
        wishlist.fetch_product(url)


@respx.mock
def test_fetch_checks_every_redirect():
    respx.get("https://loja.com/curto").mock(
        return_value=httpx.Response(302, headers={"location": "http://10.0.0.5/admin"})
    )
    with pytest.raises(wishlist.ProductFetchError, match="rede local"):
        wishlist.fetch_product("https://loja.com/curto")


@respx.mock
def test_preview_and_crud_with_group_totals(client, auth_headers):
    respx.get("https://loja.com/fone").mock(return_value=httpx.Response(200, text=JSON_LD_PAGE))
    preview = client.post(
        "/wishlist/preview", json={"url": "https://loja.com/fone"}, headers=auth_headers
    )
    assert preview.status_code == 200
    assert preview.json()["name"] == "Fone XYZ"

    group = client.post("/wishlist/groups", json={"name": "Setup"}, headers=auth_headers).json()

    def add(name, price, group_id=None):
        body = {"name": name, "price": price, "group_id": group_id, "url": "https://loja.com/fone"}
        resp = client.post("/wishlist/items", json=body, headers=auth_headers)
        assert resp.status_code == 201, resp.text
        return resp.json()

    fone = add("Fone", "1299.90", group["id"])
    cadeira = add("Cadeira", "900", group["id"])
    add("Livro", "50")

    # Comprado sai da soma do desejado e entra no "já comprei"
    client.patch(
        f"/wishlist/items/{cadeira['id']}", json={"status": "BOUGHT"}, headers=auth_headers
    )
    # Preço mudou: entra no histórico, o primeiro preço continua guardado
    respx.get("https://loja.com/fone").mock(
        return_value=httpx.Response(200, text=JSON_LD_PAGE.replace("1299.90", "999.90"))
    )
    refreshed = client.post(f"/wishlist/items/{fone['id']}/refresh", headers=auth_headers).json()
    assert (float(refreshed["price"]), float(refreshed["first_price"])) == (999.90, 1299.90)

    w = client.get("/wishlist", headers=auth_headers).json()
    assert (float(w["total"]), w["count"]) == (1049.90, 2)
    assert float(w["ungrouped_total"]) == 50
    assert float(w["bought_total"]) == 900
    assert (float(w["groups"][0]["total"]), w["groups"][0]["count"]) == (999.90, 1)
    bought = next(i for i in w["items"] if i["name"] == "Cadeira")
    assert bought["bought_at"] is not None

    # Apagar o grupo deixa os desejos sem grupo
    client.delete(f"/wishlist/groups/{group['id']}", headers=auth_headers)
    w = client.get("/wishlist", headers=auth_headers).json()
    assert w["groups"] == [] and float(w["ungrouped_total"]) == 1049.90


def test_preview_reports_blocked_link(client, auth_headers):
    resp = client.post(
        "/wishlist/preview", json={"url": "http://localhost:8000/"}, headers=auth_headers
    )
    assert resp.status_code == 422
