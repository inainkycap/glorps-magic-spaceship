// Which world-map image to show for a given year.
//
// Every era uses the same terrain for now. To add per-era terrain (ice-age
// coastlines, ancient forests, …), drop a 2048×1024 equirectangular PNG into
// public/map/ and add a range here. The map crossfades between images when the
// displayed year crosses a boundary, including mid-flight during time travel.
// Ranges are checked in order; the first match wins.

export interface EraMap {
  from: number; // inclusive
  to: number; // exclusive
  src: string;
  label: string;
}

const base = import.meta.env.BASE_URL;

export const ERA_MAPS: EraMap[] = [
  // e.g. { from: -20000, to: -10000, src: `${base}map/ice-age.png`, label: "Last glacial maximum" },
  { from: -Infinity, to: Infinity, src: `${base}map/world.png`, label: "Present-day terrain" },
];

export function mapForEra(year: number): EraMap {
  return ERA_MAPS.find((m) => year >= m.from && year < m.to) ?? ERA_MAPS[ERA_MAPS.length - 1];
}
