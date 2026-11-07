// Wording for a jump through time (timeline arrow label, travel bubble).

import { formatYear } from "../geo";

const MINUS = "−"; // typographic minus

/** Signed years from `from` to `to`: positive = into the future. */
export const jumpYears = (from: number, to: number) => to - from;

/** Short label for the timeline arrow: "+270 yrs", "−270 yrs", "+1 yr". */
export function formatJumpShort(from: number, to: number): string {
  const d = jumpYears(from, to);
  if (d === 0) return "same era";
  const n = Math.abs(d);
  return `${d > 0 ? "+" : MINUS}${n} ${n === 1 ? "yr" : "yrs"}`;
}

/** Sentence for the bubble: "1600 → 1870 · 270 years into the future". */
export function describeJump(from: number, to: number): string {
  const d = jumpYears(from, to);
  if (d === 0) return `${formatYear(from)} · same era, no time jump`;
  const n = Math.abs(d);
  return `${formatYear(from)} → ${formatYear(to)} · ${n} ${n === 1 ? "year" : "years"} into the ${d > 0 ? "future" : "past"}`;
}
