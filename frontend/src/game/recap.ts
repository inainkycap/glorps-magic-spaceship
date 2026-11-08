import type { AdvanceDome } from "../types";

// What each dome holds partway through the "Advance 10 years" recap.
//
// - With `history` (PROPOSED in the advance response: yearly populations per species,
//   index 0 = start, last = end), the recap shows exactly what happened.
// - Without it, each species follows a smooth line from start to end: sudden
//   disasters (breach, power, meteor) are visible dips in the year they struck, an
//   outbreak's toll is spread over the years from when it started to the end, and
//   births and ordinary deaths make up the rest, spread evenly over the decade.
// - Either way a species never shows 0 before the end unless it ends at 0 (no
//   dying out and coming back).

/** Animals of one species in year `year` (0…years) without a history: see above. */
function interpolated(d: AdvanceDome, id: string, year: number, years: number): number {
  const start = d.start[id] ?? 0;
  const end = d.end[id] ?? 0;
  let suddenSoFar = 0;
  let suddenAll = 0;
  let diseaseSoFar = 0;
  let diseaseAll = 0;
  for (const e of d.events) {
    const n = e.lost[id] ?? 0;
    if (n <= 0) continue;
    if (e.type === "disease") {
      diseaseAll += n;
      const from = Math.max(1, Math.min(years, e.year));
      const share = Math.max(0, Math.min(1, (year - from + 1) / (years - from + 1)));
      diseaseSoFar += n * share;
    } else {
      suddenAll += n;
      if (e.year <= year) suddenSoFar += n;
    }
  }
  // Births minus ordinary deaths over the decade, so that the last year lands on `end`.
  const other = end - start + suddenAll + diseaseAll;
  return start + (other * year) / years - suddenSoFar - diseaseSoFar;
}

/** A species' animals in `year` from the history, if it has a usable one. */
function fromHistory(d: AdvanceDome, id: string, year: number, years: number): number | undefined {
  const h = d.history?.[id];
  if (!Array.isArray(h) || h.length < 2 || !h.every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  // Map the recap year onto the history (normally one entry per year: years + 1 entries).
  const i = Math.round((year / years) * (h.length - 1));
  return h[Math.max(0, Math.min(h.length - 1, i))];
}

/** The dome's residents in recap year `year` (0 = start, `years` = end). */
export function populationAt(d: AdvanceDome, year: number, years: number): Record<string, number> {
  if (year >= years) return { ...d.end };
  const ids = new Set([...Object.keys(d.start), ...Object.keys(d.end), ...Object.keys(d.history ?? {})]);
  const out: Record<string, number> = {};
  for (const id of ids) {
    const end = d.end[id] ?? 0;
    const raw = year <= 0 ? (d.start[id] ?? 0) : (fromHistory(d, id, year, years) ?? interpolated(d, id, year, years));
    const n = Math.max(0, Math.round(raw));
    out[id] = end > 0 ? Math.max(1, n) : n;
  }
  return out;
}
