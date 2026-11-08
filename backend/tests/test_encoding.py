"""Windows defaults to cp1252, so every text read/write must say encoding="utf-8"
(the species files contain characters like °, – and ā). This keeps it that way."""
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
CALL = re.compile(r"\b(read_text|write_text|open)\(")


def test_every_text_read_and_write_is_utf8():
    offenders = []
    for path in BACKEND.rglob("*.py"):
        if ".venv" in path.parts or "__pycache__" in path.parts:
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            code = line.split("#", 1)[0]
            if CALL.search(code) and "encoding=" not in code and '"rb"' not in code and "'rb'" not in code:
                offenders.append(f"{path.relative_to(BACKEND)}:{n}: {line.strip()}")
    assert not offenders, "missing encoding=\"utf-8\":\n" + "\n".join(offenders)


def test_species_files_really_contain_non_ascii():
    """The reason this matters: these files break under cp1252."""
    text = "".join(p.read_text(encoding="utf-8") for p in (BACKEND / "data" / "species").glob("*.json"))
    assert any(ord(ch) > 127 for ch in text)
