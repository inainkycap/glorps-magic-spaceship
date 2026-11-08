# Extra species (not loaded)

Species files that are complete and valid but **not in the game**, because they have no
sprites yet (`resident-<id>.png`, `bg-explore-<id>.png` and some hotspot icons in
`frontend/public/sprites/`). The server only loads `data/species/`, so these don't appear
in `/api/species`, the map, the timeline or the economy.

To add one back: move its file into `data/species/` (once its sprites exist) and restart the
backend. `tests/test_species.py` checks these files stay valid, so moving them back is safe.

| Species | Era | Sprites still needed |
|---|---|---|
| aurochs | 50 BC | `resident-aurochs`, `bg-explore-aurochs`, hotspot `scroll` |
| elephant_bird | 900 CE | `resident-elephant_bird`, `bg-explore-elephant_bird`, hotspot `giant-egg` |
| haasts_eagle | 1300 | `resident-haasts_eagle`, `bg-explore-haasts_eagle`, hotspot `talon` |
| moa | 1350 | `resident-moa`, `bg-explore-moa`, hotspot `pebbles` |
