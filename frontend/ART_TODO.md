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
| `glorp-fly.png` | **32×32** | 4 (6 fps) | 2× (64 px) | Glorp during time travel and when hopping to a clicked spot on the map (`map/FlightGlorp.tsx`) | Thruster flames flicker. Faces **right**; it's mirrored for westward trips. |
| `glorp-talk.png` | **32×32** | 2 (6 fps) | 2× (64 px) | Glorp in the Explore scene while giving the arrival intro (`screens/Explore.tsx`) | Mouth open/closed. Same framing as `glorp-idle.png`, which is shown once the intro is dismissed. |
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
| `zorps.png` | 16×16 | 1 | 2× in HUDs and popups, 1× in prices | The Zorps coin: HUD counter (`components/ZorpsCounter.tsx`), "+N Zorps" popups (`ZorpsToasts.tsx`), prices in the travel bubble, dome Build buttons and DNA Lab retry | Glorp's alien currency. Readable at 16 px next to a number. |
| `bubble.png` | 16×16 | 1 | 2× (9-slice) | Travel speech bubble that opens from a pin (`map/TravelBubble.tsx`, `.travel-bubble` in `src/index.css`) | **9-slice with 6 px corners.** Light fill (dark text goes on it). |
| `bubble-tail.png` | 16×8 | 1 | 2× | The bubble's pointer down to the pin | Points **down**; it's flipped by CSS when the bubble opens below the pin. Its top row overlaps the bubble's bottom edge, so start it with fill colour, not outline. |
| `button.png` | 12×12 | 1 | 2× (9-slice) | Every pixel button on the map: zoom buttons, Sanctuary link, bubble Travel/Cancel (`.px-button` in `src/index.css`) | **9-slice:** 4 px corners and edges stretch around the label; the centre fills the button. Buttons have fixed widths, so don't rely on the art to size them. |

### Explore screen

| File | Frame size (px) | Frames | Drawn at | Used where | Notes |
|---|---|---|---|---|---|
| `bg-explore-<species id>.png` (now: `bg-explore-dodo.png`, `bg-explore-passenger_pigeon.png`) | **320×180** | 1 | stretched to the 16:9 scene (~3×) | Explore scene background (`screens/Explore.tsx`, `.scene`) | One per species, named by species id. Keep the middle and lower parts fairly calm: hotspots sit on top (positions come from the species file's `x`/`y` %). Missing file = plain gradient. |
| `hotspot-<sprite>.png` (now: `egg`, `feather`, `rat`, `stump`, `sailor`, `bones`, `flock`, `barrel`, `pole`, `shore`) | 16×16 | 1 | 2× (32 px) | A scannable hotspot in the scene, and the icon in its scan bubble (`explore/ScanBubble.tsx`) | Named by the hotspot's `sprite` field. Centred on its point. CSS adds the outline/shadow and greys it out once scanned, so draw only the normal state. Missing file = "DNA"/"?" tag. |
| `need-terrain.png`, `need-temperature.png`, `need-humidity.png`, `need-oxygen.png`, `need-pressure.png` | 16×16 | 1 | 2× (32 px) | Icons in the field guide's "Ideal conditions" list (`explore/FieldGuide.tsx`) | Drawn on the light parchment card, so use dark outlines. Shown for undiscovered needs too (next to "???"). |
| `field-guide-icon.png` | 16×16 | 1 | 1× (button), 2× (card header) | "Field guide" button in Explore, and the field guide card's header | A book or notebook. |
| `field-guide-frame.png` | 16×16 | 1 | 2× (9-slice) | Field guide card frame (`.field-guide` in `src/index.css`) | **9-slice with 6 px corners.** Parchment fill (dark text sits on it). |

The Explore scan bubble and Glorp's arrival bubble reuse `bubble.png` and `bubble-tail.png` (above).

### Sanctuary (Glorp's home planet)

| File | Frame size (px) | Frames | Drawn at | Used where | Notes |
|---|---|---|---|---|---|
| `planet-terrain.png` | **320×180** | 1 | stretched to 16:9 (~3×) | Background of the Sanctuary overview and behind the big dome in the dome screen (`.planet` in `src/index.css`) | Glorp's alien home planet: sky, moons, rocky ground. 6 domes sit on it at fixed spots (3 per row at ~30% and ~72% height), so keep those areas fairly flat and calm. |
| `dome-glass.png` | **64×64** | 1 | scaled to the dome (132 px overview, 360 px detail) | The glass over every dome (`sanctuary/DomeView.tsx`) | Rim and highlights only: **keep the inside transparent**, because the interior (sky, ground, plants, residents) is drawn underneath. Circle fills the whole canvas. |
| `dome-site.png` | 32×32 | 1 | 2× | Empty building site on the overview, next to the "Build ⛽15" button | Foundation ring, flag, scaffold… |
| `dome-ground-<terrain>.png` (`forest`, `grassland`, `wetland`, `tundra`) | 64×20 | 1 | stretched across the dome's bottom ~30% | Dome interior ground | Tiles horizontally across the dome width. A flat colour shows if missing. |
| `dome-plants-<terrain>.png` (same 4 terrains) | 64×24 | 1 | stretched across the dome, sitting on the ground | Dome interior plants (trees / grass / reeds / shrubs) | Transparent background. The sky tint (temperature, humidity, oxygen, pressure) is done in CSS, so draw plants in neutral daylight. |
| `control-panel.png` | 16×16 | 1 | 2× (9-slice) | Glorp's control panel in the dome screen (`.control-panel`) | **9-slice with 6 px corners.** Dark metal, light text on it. |
| `dial-knob.png` | 16×16 | 1 | 1.5× (24 px) | The knob of each control dial (temperature, humidity, oxygen, pressure) | Used as the range-slider thumb; it slides along a straight track. |
| `disaster-breach.png`, `disaster-power.png`, `disaster-meteor.png`, `disaster-disease.png` | 16×16 | 1 | 2× | "Dome disasters" list in the dome screen | Dome breach, power failure, meteor strike, disease outbreak. |
| `resident-<species id>.png` (now: `resident-dodo.png`, `resident-passenger_pigeon.png`) | 16×16 | 2 (4 fps) | 1× in overview domes, 2× in the big dome; frame 1 as a still icon in lists | Animals wandering inside domes, and icons in the pool / placement / results lists | Walk cycle, facing **right**. One per species, named by species id. A small square shows if missing. |

### DNA Lab minigame

| File | Frame size (px) | Frames | Drawn at | Used where | Notes |
|---|---|---|---|---|---|
| `dna-base-a.png`, `dna-base-t.png`, `dna-base-c.png`, `dna-base-g.png` | 16×16 | 1 | 2× (32 px) | The strand's bases, the player's answers and the 4 big answer buttons (`lab/DnaGame.tsx`) | A letter tile per base. **Keep the four colours clearly different** (placeholder: A rose, T sand, C mint, G blue) and the letter readable at 32 px. CSS adds the borders for current / right / wrong. |
| `dna-base-degraded.png` | 16×16 | 1 | 2× | A degraded base, shown as "?" until its turn (older species have more) | Cracked, faded tile with a "?". |

Glorp's result speech bubble reuses `glorp-talk.png` and `bubble.png`.

## Nice to have later

- `zib.png`: the "zib zib zib" trail is text right now; it could become a small sprite.
- DNA Lab: a short "zap" frame for a correct pair, and a helix backdrop behind the strand.
- A `glorp-land` animation (a few frames played on arrival).
- Per-era map terrain: see `src/map/eras.ts`. Each era needs a detailed and an overview image.
- UI rule for all art: **nothing moves on hover or press.** Interactive states change colour or brightness only (done in CSS), so no separate hover/pressed frames are needed.
