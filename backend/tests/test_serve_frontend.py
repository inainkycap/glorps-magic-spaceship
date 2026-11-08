"""The backend can serve the built frontend (one process for the demo / deployment)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import serve_frontend


def make_client(tmp_path, built=True):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    if built:
        (dist / "index.html").write_text("<html>glorp</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("nope", encoding="utf-8")
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    served = serve_frontend(app, dist)
    return served, TestClient(app)


def test_serves_index_files_and_spa_routes(tmp_path):
    served, client = make_client(tmp_path)
    assert served
    assert "glorp" in client.get("/").text
    assert client.get("/assets/app.js").text == "console.log(1)"
    # client-side routes fall back to index.html so a reload works
    assert "glorp" in client.get("/sanctuary/dome-1").text


def test_api_routes_still_win_and_unknown_api_is_404(tmp_path):
    _, client = make_client(tmp_path)
    assert client.get("/api/health").json() == {"status": "ok"}
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}


def test_no_path_traversal(tmp_path):
    _, client = make_client(tmp_path)
    r = client.get("/..%2Fsecret.txt")
    assert "nope" not in r.text


def test_does_nothing_without_a_build(tmp_path):
    served, client = make_client(tmp_path, built=False)
    assert not served
    assert client.get("/").status_code == 404
