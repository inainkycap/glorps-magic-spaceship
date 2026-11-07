// Which world-map image to show for a given year and zoom.
//
// Each era has two images, both equirectangular (made by scripts/make-terrain-map.mjs):
//   src          2048×1024 detailed terrain, used at zoom ≥ OVERVIEW_BELOW_ZOOM
//   overviewSrc  1024×512 simplified terrain, used when zoomed out
// The map crossfades whenever the chosen image changes: zooming across the
// threshold, or the displayed year crossing an era boundary mid-flight.
//
// Every era uses the same terrain for now. To add per-era terrain (ice-age
// coastlines, ancient forests, …), drop the two PNGs into public/map/ and add a
// range here. Ranges are checked in order; the first match wins.

export interface EraMap {
  from: number; // inclusive
  to: number; // exclusive
  src: string;
  overviewSrc: string;
  label: string;
}

/** Below this zoom the simplified overview map is shown. */
export const OVERVIEW_BELOW_ZOOM = 2;

const base = import.meta.env.BASE_URL;

export const ERA_MAPS: EraMap[] = [
  // e.g. { from: -20000, to: -10000, src: `${base}map/ice-age.png`, overviewSrc: `${base}map/ice-age-simple.png`, label: "Last glacial maximum" },
  {
    from: -Infinity,
    to: Infinity,
    src: `${base}map/world.png`,
    overviewSrc: `${base}map/world-simple.png`,
    label: "Present-day terrain",
  },
];

export function mapForEra(year: number): EraMap {
  return ERA_MAPS.find((m) => year >= m.from && year < m.to) ?? ERA_MAPS[ERA_MAPS.length - 1];
}

/** The image to draw for this year at this zoom. */
export function mapImageFor(year: number, zoom: number): string {
  const m = mapForEra(year);
  return zoom < OVERVIEW_BELOW_ZOOM ? m.overviewSrc : m.src;
}
