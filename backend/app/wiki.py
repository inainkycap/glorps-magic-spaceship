"""Wikipedia summaries for the field guide, cached on disk so the demo works offline.

Uses the official Wikipedia REST API (no scraping):
  GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}

Every successful lookup is saved to data/wiki_cache/<title>.json and served from there
afterwards. Run `python -m scripts.prefetch_wiki` before a demo to fill the cache for every
species' sources.
"""
import json
import re
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote, urlparse

import httpx
from pydantic import BaseModel

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "wiki_cache"
API = "https://en.wikipedia.org/api/rest_v1/page/summary/"
HEADERS = {  # Wikimedia's robot policy wants a contact URL in the User-Agent
    "User-Agent": "GlorpsMagicSpaceship/0.1 (https://github.com/inainkycap/glorps-magic-spaceship; student hackathon project)"
}
TIMEOUT = 5.0


class WikiSummary(BaseModel):
    title: str
    summary: str
    image_url: Optional[str] = None
    url: Optional[str] = None  # the article, for "read more"


class WikiError(Exception):
    """Not found (404) or Wikipedia unreachable with nothing cached (502)."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def normalise(title: str) -> str:
    """'ball's pyramid' and "Ball's_Pyramid" are the same article."""
    title = unquote(title).strip().replace(" ", "_")
    return title[:1].upper() + title[1:]


def cache_path(title: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_-]", "-", normalise(title))[:120]  # no ../ tricks
    return CACHE_DIR / f"{safe}.json"


def title_from_url(url: str) -> Optional[str]:
    """https://en.wikipedia.org/wiki/Ball%27s_Pyramid -> Ball's_Pyramid."""
    u = urlparse(url)
    if not u.netloc.endswith("wikipedia.org") or not u.path.startswith("/wiki/"):
        return None
    return normalise(u.path[len("/wiki/"):])


def fetch(title: str, client: Optional[httpx.Client] = None) -> WikiSummary:
    """Ask Wikipedia (no cache)."""
    c = client or httpx.Client(headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
    try:
        r = c.get(API + quote(normalise(title), safe=""))
    except httpx.HTTPError as e:
        raise WikiError(502, f"Wikipedia unreachable: {e.__class__.__name__}") from e
    finally:
        if client is None:
            c.close()
    if r.status_code == 404:
        raise WikiError(404, "No Wikipedia article with that title")
    if r.status_code != 200:
        raise WikiError(502, f"Wikipedia returned {r.status_code}")
    d = r.json()
    image = (d.get("originalimage") or d.get("thumbnail") or {}).get("source")
    page = ((d.get("content_urls") or {}).get("desktop") or {}).get("page")
    return WikiSummary(title=d.get("title", title), summary=d.get("extract", ""), image_url=image, url=page)


def get_summary(title: str, client: Optional[httpx.Client] = None) -> WikiSummary:
    """Cached first; otherwise fetch and cache."""
    path = cache_path(title)
    if path.exists():
        return WikiSummary.model_validate_json(path.read_text())
    summary = fetch(title, client)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary.model_dump(), indent=2, ensure_ascii=False) + "\n")
    return summary
