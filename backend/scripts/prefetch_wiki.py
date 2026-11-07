"""Fill data/wiki_cache/ for every Wikipedia source in every species file.

Run from backend/ before a demo (needs internet once; afterwards the API works offline):
    python -m scripts.prefetch_wiki
"""
from app.species import SPECIES
from app.wiki import WikiError, get_summary, title_from_url


def main():
    titles = []
    for s in SPECIES.values():
        for src in s.sources or []:
            t = title_from_url(src.url)
            if t and t not in titles:
                titles.append(t)
    for t in titles:
        try:
            w = get_summary(t)
            print(f"ok    {t}: {w.summary[:60]}...")
        except WikiError as e:
            print(f"FAIL  {t}: {e}")


if __name__ == "__main__":
    main()
