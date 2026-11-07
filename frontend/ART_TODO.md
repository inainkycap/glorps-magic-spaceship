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
| `timeline-glorp.png` | 16×16 | 2 (3 fps) | 2× | Glorp marker on the era timeline (`components/EraTimeline.tsx`) | Sits just above the timeline line. The vertical rule and the year label are drawn by CSS. |
| `timeline-glorp-ghost.png` | 16×16 | 1 | 2× | Faded "ghost" Glorp above the target era while a travel bubble is open (`components/EraTimeline.tsx`) | Same silhouette as `timeline-glorp.png`, pale and semi-transparent (CSS also fades it to 45%). |
| `timeline-arrowhead.png` | 8×8 | 1 | 2× | Head of the time-travel preview arrow on the timeline (`TimeArrow` in `components/EraTimeline.tsx`) | Points **right** (future); mirrored by CSS for trips into the past. The arrow's dashes are 4 px CSS squares in Glorp mint, so match that colour. |
| `era-marker.png` | 16×16 | 1 | 2× (32 px) | Species era marker on the timeline, any era **other than** the current one (`components/EraTimeline.tsx`) | **Outlined** shape (e.g. a diamond ring). Use a high-contrast colour against the dark timeline panel (placeholder `#f4d67a`). Clicking it opens the travel bubble. |
| `era-marker-current.png` | 16×16 | 1 | 2× (32 px) | Species era marker for the **current** era | **Filled** version of `era-marker.png`, same size and silhouette, so it's clear which one is current. |
| `icon-plus.png` | 16×16 | 1 | 2× | Map zoom-in button (`map/WorldMap.tsx`) | |
| `icon-minus.png` | 16×16 | 1 | 2× | Map zoom-out button | |
| `btn_recenter_glorp.png` | 16×16 | 1 | 2× | Map "recenter on Glorp" button (`map/WorldMap.tsx`) | Glorp's face: antenna, eyes, smile. |
| `fuel-icon.png` | 16×16 | 1 | 1× | Fuel gauge icon in every HUD (`components/FuelGauge.tsx`) | Jerrycan, fuel cell, or similar. |
| `fuel-gauge.png` | 48×10 | 1 | 2× (96×20) | Fuel gauge frame (`components/FuelGauge.tsx`) | Frame only. Keep the **44×6 window at (2,2) transparent**: the fill bar is drawn by CSS underneath (mint, rose when low). Quarter ticks optional. |
| `bubble.png` | 16×16 | 1 | 2× (9-slice) | Travel speech bubble that opens from a pin (`map/TravelBubble.tsx`, `.travel-bubble` in `src/index.css`) | **9-slice with 6 px corners.** Light fill (dark text goes on it). |
| `bubble-tail.png` | 16×8 | 1 | 2× | The bubble's pointer down to the pin | Points **down**; it's flipped by CSS when the bubble opens below the pin. Its top row overlaps the bubble's bottom edge, so start it with fill colour, not outline. |
| `button.png` | 12×12 | 1 | 2× (9-slice) | Every pixel button on the map: zoom buttons, Sanctuary link, bubble Travel/Cancel (`.px-button` in `src/index.css`) | **9-slice:** 4 px corners and edges stretch around the label; the centre fills the button. Buttons have fixed widths, so don't rely on the art to size them. |

## Nice to have later

- `zib.png`: the "zib zib zib" trail is text right now; it could become a small sprite.
- A `glorp-land` animation (a few frames played on arrival).
- Per-era map terrain: see `src/map/eras.ts`. Each era needs a detailed and an overview image.
- UI rule for all art: **nothing moves on hover or press.** Interactive states change colour or brightness only (done in CSS), so no separate hover/pressed frames are needed.
