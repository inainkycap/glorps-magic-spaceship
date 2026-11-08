// Time: years-ago, era formatting and the era timeline scale (pure, no React).
//
// Years are astronomical-style integers like the species files: 1600 = 1600 CE,
// -2000 = 2000 BCE, and there is NO year 0 (1 BCE is followed by 1 CE).

export const PRESENT_YEAR = 2026;

/** Years before the present. 2026 → 0, 1600 → 426, -1 (1 BCE) → 2026, -2000 → 4025. */
export function yearsAgo(year: number): number {
  if (!Number.isFinite(year)) return 0;
  const y = year === 0 ? -1 : year; // there is no year 0
  return Math.max(0, y >= 1 ? PRESENT_YEAR - y : PRESENT_YEAR - y - 1);
}

/** Inverse of yearsAgo (whole years; skips year 0). */
export function yearFromYearsAgo(ago: number): number {
  const y = Math.round(PRESENT_YEAR - Math.max(0, ago));
  return y >= 1 ? y : y - 1;
}

const group = (n: number) => Math.round(n).toLocaleString("en-US");

/** A number of years, compact: "1 yr", "270 yrs", "12,000 yrs", "2.5 million yrs", "66 million yrs". */
export function formatYears(n: number, long = false): string {
  const a = Math.abs(n);
  const unit = (one: boolean) => (long ? (one ? "year" : "years") : one ? "yr" : "yrs");
  if (a < 1e6) return `${group(a)} ${unit(Math.round(a) === 1)}`;
  const big = a >= 1e9 ? { v: a / 1e9, w: "billion" } : { v: a / 1e6, w: "million" };
  const v = big.v < 10 ? Math.round(big.v * 10) / 10 : Math.round(big.v);
  return `${v} ${big.w} ${unit(false)}`;
}

/** "today", "10 yrs ago", "66 million yrs ago". */
export function formatAgo(ago: number): string {
  return ago <= 0 ? "today" : `${formatYears(ago)} ago`;
}

/** Older than this, eras are shown as "N yrs ago" rather than a calendar year. */
const DEEP_TIME_YEARS_AGO = 10_000;

/**
 * THE era label, used everywhere (pins, bubbles, timeline, Glorp's marker, the
 * travel animation): "today", "1987", "900 CE", "1,000 BC", "12,000 yrs ago",
 * "66 million yrs ago".
 */
export function formatEra(year: number): string {
  const ago = yearsAgo(year);
  if (ago <= 0) return "today";
  if (ago >= DEEP_TIME_YEARS_AGO) return formatAgo(ago);
  if (year >= 1000) return String(year);
  if (year >= 1) return `${year} CE`;
  return `${group(year === 0 ? 1 : -year)} BC`;
}

// --- The timeline scale ------------------------------------------------------------

/** Spans longer than this use a log scale of years ago (so recent eras aren't squashed). */
export const LOG_SCALE_ABOVE_YEARS = 1000;
/** Same offset as the backend's timeline (log of 0 is undefined; keeps "today" finite). */
const LOG_OFFSET = 10;
/** Padding, as a fraction of the track, on the old (left) and present (right) ends. */
const PAD_OLD = 0.04;
const PAD_NOW = 0.03;
/** Extra room beyond the oldest era, as a fraction of the span. */
const SPAN_PAD = 0.08;
/** Ticks closer than this (fraction of the track) are dropped. */
const MIN_TICK_GAP = 0.085;

export interface EraTick {
  year: number;
  label: string;
  pos: number;
}

export interface EraScale {
  kind: "linear" | "log";
  /** 0..1 position on the track: ~0 = oldest edge, ~1 = the present. */
  pos: (year: number) => number;
  ticks: EraTick[];
}

/**
 * Build the era timeline scale for a set of eras: from the oldest (plus padding)
 * to the present. Linear if they span ≤ ~1,000 years, otherwise a log scale of
 * years ago. Recompute whenever the species list changes.
 */
export function buildEraScale(eraYears: number[]): EraScale {
  const oldestAgo = Math.max(1, ...eraYears.filter(Number.isFinite).map(yearsAgo));
  const kind: EraScale["kind"] = oldestAgo > LOG_SCALE_ABOVE_YEARS ? "log" : "linear";
  const edgeAgo = kind === "log" ? oldestAgo * (1 + SPAN_PAD * 4) : oldestAgo * (1 + SPAN_PAD);

  // raw: 0 at the present, 1 at the old edge
  const raw =
    kind === "log"
      ? (ago: number) => Math.log((ago + LOG_OFFSET) / LOG_OFFSET) / Math.log((edgeAgo + LOG_OFFSET) / LOG_OFFSET)
      : (ago: number) => ago / edgeAgo;
  const toTrack = (r: number) => PAD_OLD + (1 - Math.min(1, Math.max(0, r))) * (1 - PAD_OLD - PAD_NOW);
  const pos = (year: number) => toTrack(raw(yearsAgo(year)));

  const candidates: { year: number; label: string }[] =
    kind === "log" ? logTickCandidates(edgeAgo) : linearTickCandidates(edgeAgo);
  const ticks: EraTick[] = [];
  for (const c of candidates) {
    const p = pos(c.year);
    if (yearsAgo(c.year) > edgeAgo) continue;
    if (ticks.some((t) => Math.abs(t.pos - p) < MIN_TICK_GAP)) continue;
    ticks.push({ ...c, pos: p });
  }
  ticks.sort((a, b) => a.pos - b.pos);
  return { kind, pos, ticks };
}

/** Log-scale ticks, most important first (later ones are dropped if crowded). */
function logTickCandidates(edgeAgo: number) {
  const out: { year: number; label: string }[] = [{ year: PRESENT_YEAR, label: "today" }];
  const ago = (a: number, label = formatAgo(a)) => out.push({ year: yearFromYearsAgo(a), label });
  ago(100);
  out.push({ year: -1000, label: formatEra(-1000) });
  // powers of ten into deep time
  for (let a = 10_000; a <= edgeAgo; a *= 10) ago(a);
  out.push({ year: 1500, label: "1500" }, { year: 1000, label: "1000" });
  ago(10);
  out.push({ year: 1, label: "1 CE" }, { year: -5000, label: formatEra(-5000) });
  for (let a = 30_000; a <= edgeAgo; a *= 10) ago(a);
  return out;
}

/** Linear ticks: "today" plus round calendar years. */
function linearTickCandidates(edgeAgo: number) {
  const steps = [10, 20, 25, 50, 100, 200, 250];
  const step = steps.find((s) => edgeAgo / s <= 7) ?? 250;
  const out: { year: number; label: string }[] = [{ year: PRESENT_YEAR, label: "today" }];
  const oldestYear = yearFromYearsAgo(edgeAgo);
  for (let y = Math.floor(PRESENT_YEAR / step) * step; y >= oldestYear; y -= step) {
    if (y !== 0 && y !== PRESENT_YEAR) out.push({ year: y, label: formatEra(y) });
  }
  return out;
}

/**
 * Interpolate between two eras in LOG time (years ago + offset), so a trip from
 * today to 66 million years ago ticks smoothly through 10, 100, 1,000… years
 * ago rather than leaping past everything recent. f: 0 → a, 1 → b.
 */
export function lerpEra(a: number, b: number, f: number): number {
  const t = Math.min(1, Math.max(0, f));
  if (t === 0) return a;
  if (t === 1) return b;
  const la = Math.log(yearsAgo(a) + LOG_OFFSET);
  const lb = Math.log(yearsAgo(b) + LOG_OFFSET);
  return yearFromYearsAgo(Math.exp(la + (lb - la) * t) - LOG_OFFSET);
}
