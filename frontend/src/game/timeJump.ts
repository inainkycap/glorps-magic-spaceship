// Wording for a jump through time (timeline arrow label, travel bubble).
// Uses the one era format (game/time.ts), so deep time reads naturally.

import { formatEra, formatYears, yearsAgo } from "./time";

const MINUS = "−"; // typographic minus

/** Years from `from` to `to` (positive = into the future), BCE-safe. */
export const jumpYears = (from: number, to: number) => yearsAgo(from) - yearsAgo(to);

/** Short label for the timeline arrow: "+270 yrs", "−4,025 yrs", "−66 million yrs". */
export function formatJumpShort(from: number, to: number): string {
  const d = jumpYears(from, to);
  if (d === 0) return "same era";
  return `${d > 0 ? "+" : MINUS}${formatYears(d)}`;
}

/** Sentence for the bubble: "1600 → 1870 · 270 years into the future". */
export function describeJump(from: number, to: number): string {
  const d = jumpYears(from, to);
  if (d === 0) return `${formatEra(from)} · same era, no time jump`;
  return `${formatEra(from)} → ${formatEra(to)} · ${formatYears(d, true)} into the ${d > 0 ? "future" : "past"}`;
}
