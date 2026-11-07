import httpx
import pytest
from fastapi.testclient import TestClient

from app import wiki
from app.main import app

client = TestClient(app)

DODO = {
    "title": "Dodo",
    "extract": "The dodo is an extinct flightless bird.",
    "originalimage": {"source": "https://upload.wikimedia.org/dodo.jpg"},
    "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Dodo"}},
}


@pytest.fixture(autouse=True)
def temp_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(wiki, "CACHE_DIR", tmp_path)
    return tmp_path


def fake_wikipedia(calls):
    def handler(request: httpx.Request):
        calls.append(request.url.path)
        if request.url.path.endswith("/Dodo"):
            return httpx.Response(200, json=DODO)
        return httpx.Response(404, json={})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetches_then_serves_from_cache():
    calls = []
    c = fake_wikipedia(calls)
    first = wiki.get_summary("dodo", c)  # normalised to "Dodo"
    second = wiki.get_summary("Dodo", c)
    assert first == second
    assert first.summary.startswith("The dodo") and first.image_url.endswith("dodo.jpg")
    assert len(calls) == 1  # second one came from the cache


def test_not_found():
    with pytest.raises(wiki.WikiError) as e:
        wiki.get_summary("No_such_bird", fake_wikipedia([]))
    assert e.value.status == 404


def test_offline_without_cache_is_502():
    def boom(request):
        raise httpx.ConnectError("offline")
    with pytest.raises(wiki.WikiError) as e:
        wiki.get_summary("Dodo", httpx.Client(transport=httpx.MockTransport(boom)))
    assert e.value.status == 502


def test_cache_names_are_safe():
    p = wiki.cache_path("../../etc/passwd")
    assert p.parent == wiki.CACHE_DIR and ".." not in p.name


def test_title_from_url():
    assert wiki.title_from_url("https://en.wikipedia.org/wiki/Ball%27s_Pyramid") == "Ball's_Pyramid"
    assert wiki.title_from_url("https://example.com/wiki/Dodo") is None


def test_endpoint_serves_cached_article(temp_cache):
    wiki.cache_path("Dodo").write_text(wiki.WikiSummary(title="Dodo", summary="Cached!").model_dump_json())
    r = client.get("/api/wiki/Dodo")
    assert r.status_code == 200 and r.json()["summary"] == "Cached!"
