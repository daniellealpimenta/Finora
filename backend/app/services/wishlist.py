"""Lista de desejos: dados do produto a partir do link, totais e acompanhamento de preço.

O link é lido como uma página comum, procurando, nesta ordem:
1. JSON-LD schema.org/Product (preço em `offers`), que a maioria das lojas publica para o Google;
2. OpenGraph (`og:title`, `og:image`, `product:price:amount`);
3. `itemprop="price"`.
Lojas que bloqueiam robôs (Amazon, às vezes) devolvem pouco ou nada: o usuário completa à mão.

Como o servidor busca a URL que o usuário colou, ela não pode apontar para a rede local
(roteador, a própria API): o host é resolvido e IPs privados ou de loopback são recusados,
inclusive depois de cada redirecionamento.
"""

import ipaddress
import json
import logging
import re
import socket
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import WishItem, WishPrice, WishStatus

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 5
REFRESH_EVERY = timedelta(hours=24)
# Algumas lojas só devolvem a página completa para um navegador
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "pt-BR,pt;q=0.9",
}


class ProductFetchError(Exception):
    """Link inválido, bloqueado ou fora do ar (a mensagem vai para o usuário)."""


# --- leitura da página ---------------------------------------------------------------


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.json_ld: list[str] = []
        self.itemprop_price: str | None = None
        self.title = ""
        self._in_ld = False
        self._in_title = False
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: v or "" for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            if key and "content" in a:
                self.meta.setdefault(key, a["content"].strip())
        if a.get("itemprop") == "price" and self.itemprop_price is None:
            self.itemprop_price = a.get("content") or None
        if tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self._in_ld, self._buffer = True, []
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_ld:
            self.json_ld.append("".join(self._buffer))
            self._in_ld = False
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_ld:
            self._buffer.append(data)
        elif self._in_title:
            self.title += data


def parse_price(value: object) -> Decimal | None:
    """ "1299.90", "1.299,90", "R$ 1.299", 1299.9 -> Decimal. None se não der para ler."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        text = str(value)
    else:
        text = re.sub(r"[^\d.,]", "", str(value))
        if not text:
            return None
        if "," in text and "." in text:
            # O separador que vem por último é o decimal
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif "," in text:
            text = text.replace(".", "").replace(",", ".")
        elif re.fullmatch(r"\d{1,3}(\.\d{3})+", text):
            text = text.replace(".", "")  # "1.299" = mil duzentos e noventa e nove
    try:
        price = Decimal(text).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None
    return price if price > 0 else None


def _types(node: dict) -> set[str]:
    t = node.get("@type")
    return {str(x) for x in t} if isinstance(t, list) else {str(t)}


def _find_product(node: object) -> dict | None:
    """Primeiro objeto Product dentro do JSON-LD (pode estar em lista ou em @graph)."""
    if isinstance(node, list):
        for child in node:
            if found := _find_product(child):
                return found
    elif isinstance(node, dict):
        if "Product" in _types(node):
            return node
        for key in ("@graph", "mainEntity", "itemOffered"):
            if found := _find_product(node.get(key)):
                return found
    return None


def _offer_price(offers: object) -> tuple[Decimal | None, str | None]:
    if isinstance(offers, list):
        prices = [p for p in (_offer_price(o) for o in offers) if p[0] is not None]
        return min(prices, key=lambda p: p[0]) if prices else (None, None)
    if not isinstance(offers, dict):
        return None, None
    price = offers.get("price")
    if price is None:
        price = offers.get("lowPrice")  # AggregateOffer
    if price is None and isinstance(offers.get("priceSpecification"), dict):
        price = offers["priceSpecification"].get("price")
    return parse_price(price), offers.get("priceCurrency")


def _image(value: object) -> str | None:
    if isinstance(value, list):
        return _image(value[0]) if value else None
    if isinstance(value, dict):
        return value.get("url") or value.get("contentUrl")
    return str(value) if value else None


def parse_product(html: str, url: str) -> dict:
    """Nome, preço, moeda, imagem e loja que a página informa (o que faltar vem None)."""
    page = _PageParser()
    page.feed(html)
    name = price = currency = image = None

    for block in page.json_ld:
        try:
            product = _find_product(json.loads(block))
        except ValueError:
            continue
        if product:
            name = product.get("name")
            price, currency = _offer_price(product.get("offers"))
            image = _image(product.get("image"))
            break

    m = page.meta
    name = name or m.get("og:title") or m.get("twitter:title") or page.title.strip() or None
    if price is None:
        price = parse_price(
            m.get("product:price:amount") or m.get("og:price:amount") or page.itemprop_price
        )
        currency = currency or m.get("product:price:currency") or m.get("og:price:currency")
    image = image or m.get("og:image") or m.get("twitter:image")
    host = urlsplit(url).hostname or ""
    store = m.get("og:site_name") or host.removeprefix("www.") or None
    return {
        "url": url,
        "name": str(name).strip()[:255] if name else None,
        "price": price,
        "currency": currency or "BRL",
        "image_url": urljoin(url, image)[:2048] if image else None,
        "store": str(store)[:100] if store else None,
    }


# --- busca segura ------------------------------------------------------------------


def _resolve(host: str) -> list[str]:
    return [info[4][0] for info in socket.getaddrinfo(host, None)]


def _check_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ProductFetchError("Use um link http:// ou https://")
    try:
        addresses = _resolve(parts.hostname)
    except OSError:
        raise ProductFetchError("Não encontrei esse site") from None
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global:
            raise ProductFetchError("Esse link aponta para a rede local")


def fetch_product(url: str, http: httpx.Client | None = None) -> dict:
    url = url.strip()
    client = http or httpx.Client(timeout=10, headers=_HEADERS)
    try:
        for _ in range(MAX_REDIRECTS + 1):
            _check_url(url)
            with client.stream("GET", url, follow_redirects=False) as resp:
                if resp.is_redirect and "location" in resp.headers:
                    url = urljoin(url, resp.headers["location"])
                    continue
                if resp.status_code >= 400:
                    raise ProductFetchError(f"A loja respondeu com erro {resp.status_code}")
                body = b""
                for chunk in resp.iter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        break
                html = body[:MAX_BYTES].decode(resp.encoding or "utf-8", errors="replace")
                return parse_product(html, url)
        raise ProductFetchError("Redirecionamentos demais")
    except httpx.HTTPError:
        raise ProductFetchError("Não consegui abrir o link") from None
    finally:
        if http is None:
            client.close()


# --- totais e preço ---------------------------------------------------------------------


def totals(items: list[WishItem]) -> dict:
    """Soma do que ainda é desejado (comprados e desistidos ficam fora), geral e por grupo."""
    wanted = [i for i in items if i.status == WishStatus.WANTED]
    by_group: dict[int | None, Decimal] = {}
    for i in wanted:
        by_group[i.group_id] = by_group.get(i.group_id, ZERO) + i.price
    return {
        "wanted": sum((i.price for i in wanted), ZERO),
        "wanted_count": len(wanted),
        "bought": sum((i.price for i in items if i.status == WishStatus.BOUGHT), ZERO),
        "by_group": by_group,
    }


def set_price(item: WishItem, price: Decimal) -> None:
    """Muda o preço e registra no histórico (só quando muda de fato)."""
    if item.prices and item.prices[-1].price == price:
        return
    item.price = price
    item.prices.append(WishPrice(price=price, checked_at=datetime.now(UTC)))


def refresh_item(item: WishItem, http: httpx.Client | None = None) -> None:
    if not item.url:
        return
    product = fetch_product(item.url, http)
    item.last_checked_at = datetime.now(UTC)
    if product["price"] is not None:
        set_price(item, product["price"])
    if not item.image_url and product["image_url"]:
        item.image_url = product["image_url"]


def refresh_prices(db: Session, now: datetime | None = None) -> int:
    """Rechecagem diária dos desejos com link. Devolve quantos foram checados."""
    now = now or datetime.now(UTC)
    checked = 0
    query = select(WishItem).where(WishItem.status == WishStatus.WANTED, WishItem.url.is_not(None))
    with httpx.Client(timeout=10, headers=_HEADERS) as http:
        for item in db.scalars(query):
            last = item.last_checked_at
            if last is not None and last.tzinfo is None:  # SQLite devolve sem fuso
                last = last.replace(tzinfo=UTC)
            if last is not None and now - last < REFRESH_EVERY:
                continue
            try:
                refresh_item(item, http)
            except ProductFetchError as e:
                item.last_checked_at = now  # tenta de novo amanhã
                logger.info("Preço de %r não atualizado: %s", item.name, e)
            checked += 1
            db.commit()
    return checked
