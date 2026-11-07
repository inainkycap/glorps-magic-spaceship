# Art TODO — pixel sprites

Every UI sprite loads from `frontend/public/sprites/<name>.png`. The current files are
**placeholders** drawn by `scripts/make-placeholder-sprites.mjs`. To replace one, save
your art over the same file name with the **same frame size and frame count**. No code
change is needed.

## Format

- PNG with transparency, drawn at 1× (the game scales it up with nearest-neighbour).
- Animated sprites are a **horizontal strip**: frame 1 at the left, each frame the same
  size, no gaps. A 4-frame 32×32 sheet is 128×32.
- Palette: soft and low-saturation, to match the map (`public/map/world.png`). Outline
  `#1d2230`, Glorp mint `#9fd3b4`, sand `#e2c991`, parchment `#ece6d6`, rose `#d99a9a`.
- If a file is missing or broken, the game falls back to a built-in placeholder, so art
  can land one file at a time.
- Don't re-run `npm run sprites:placeholders` with no arguments once real art is in:
  it overwrites every file. Pass names to regenerate only some, e.g.
  `npm run sprites:placeholders -- pin`.

## Sprites

| File | Frame size (px) | Frames | Drawn at | Used where | Notes |
|---|---|---|---|---|---|
| `glorp-idle.png` | **32×32** | 4 (6 fps) | 2× (64 px) | Glorp sitting on the world map (`map/GlorpMarker.tsx`) | Gentle hover bob, blinking hull lights. Ship centred; the map point is at the top-centre of the frame. |
| `glorp-fly.png` | **32×32** | 4 (6 fps) | 2× (64 px) | Glorp during time travel and when hovering to a clicked spot (`components/TravelAnimation.tsx`, `map/GlorpMarker.tsx`) | Thruster flames flicker. Faces **right**; it's mirrored for westward trips. |
| `pin.png` | 16×24 | 1 | 2× | Species pin on the map (`map/PinLayer.tsx`) | Tip at the bottom centre, 2 px above the bottom edge. The current-era glow is added by CSS, so don't bake one in. |
| `pin-saved.png` | 16×24 | 1 | 2× | Pin for a species already saved to the Sanctuary | Same shape as `pin.png`, different colour or a badge. |
| `timeline-glorp.png` | 16×16 | 2 (3 fps) | 2× | Glorp marker on the era timeline (`components/EraTimeline.tsx`) | Centred on the timeline line. A vertical rule and the year label are drawn by CSS. |
| `timeline-species.png` | 8×8 | 1 | 2× | Species era marker on the timeline | Small diamond or gem. |
| `arrow-left.png` | 16×16 | 1 | 1× | "◀ Further back" button | |
| `arrow-right.png` | 16×16 | 1 | 1× | "Forward ▶" button | |
| `icon-time.png` | 16×16 | 1 | 1× | "Time travel" button | Hourglass or clock. |
| `icon-plus.png` | 16×16 | 1 | 2× | Map zoom-in button (`map/WorldMap.tsx`) | |
| `icon-minus.png` | 16×16 | 1 | 2× | Map zoom-out button | |
| `icon-recenter.png` | 16×16 | 1 | 2× | Map "recenter on Glorp" button | |
| `button.png` | 12×12 | 1 | 2× (9-slice) | Every pixel button on the map: timeline buttons, zoom buttons, Sanctuary link (`.px-button` in `src/index.css`) | **9-slice:** 4 px corners and edges stretch around the label; the centre fills the button. |

## Nice to have later

- `zib.png`: the "zib zib zib" trail is text right now; it could become a small sprite.
- A `glorp-land` animation (a few frames played on arrival).
- Per-era map terrain: see `src/map/eras.ts`.
