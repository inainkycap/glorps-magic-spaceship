// DNA Lab minigame rules (frontend-only). The player matches each base of a
// strand with its partner (A↔T, C↔G) against the clock. Quality % → individuals
// rescued (4–20), which become the species' pool in the Sanctuary.

import { yearsAgo } from "./time";

export type Base = "A" | "T" | "C" | "G";
export const BASES: Base[] = ["A", "T", "C", "G"];
export const PARTNER: Record<Base, Base> = { A: "T", T: "A", C: "G", G: "C" };

export interface DnaDifficulty {
  /** Bases in the strand. */
  bases: number;
  /** How many are degraded: shown as "?" (revealed briefly when it's their turn). */
  degraded: number;
  /** Time limit. */
  seconds: number;
}

/**
 * THE difficulty formula: older DNA is longer and more degraded. Scales with
 * the years between the species' era and the present:
 *   bases    = 10 + 1 per 150 years (max 16)
 *   degraded = 1 per 120 years (max 6, never more than a third of the strand)
 *   seconds  = 20, +1 per extra base beyond 12, so long strands stay fair
 * e.g. 1870 → 11 bases, 1 degraded, 20 s; 1600 → 13 bases, 3 degraded, 21 s.
 */
export function dnaDifficulty(eraYear: number): DnaDifficulty {
  const age = Math.min(3000, yearsAgo(eraYear)); // BCE-safe (no year 0)
  const bases = Math.min(16, 10 + Math.round(age / 150));
  const degraded = Math.min(6, Math.floor(age / 120), Math.floor(bases / 3));
  const seconds = 20 + Math.max(0, bases - 12);
  return { bases, degraded, seconds };
}

export interface Strand {
  bases: Base[];
  /** Indices of degraded bases (shown as "?"). */
  degraded: Set<number>;
}

/** A random strand for this difficulty. `rand` is injectable for tests. */
export function makeStrand(d: DnaDifficulty, rand: () => number = Math.random): Strand {
  const bases = Array.from({ length: d.bases }, () => BASES[Math.floor(rand() * 4)]);
  const order = Array.from({ length: d.bases }, (_, i) => i).sort(() => rand() - 0.5);
  return { bases, degraded: new Set(order.slice(0, d.degraded)) };
}

/** Quality, 0..1: the fraction of bases matched correctly (unanswered = wrong). */
export function quality(strand: Base[], answers: (Base | null)[]): number {
  if (strand.length === 0) return 0;
  const right = strand.filter((b, i) => answers[i] === PARTNER[b]).length;
  return right / strand.length;
}

export const MIN_RESCUED = 4;
export const MAX_RESCUED = 20;

/** Individuals rescued from a quality 0..1: 4 at 0 %, 20 at 100 %, linear, whole numbers. */
export function individualsFromQuality(q: number): number {
  const clamped = Math.min(1, Math.max(0, q));
  return Math.round(MIN_RESCUED + (MAX_RESCUED - MIN_RESCUED) * clamped);
}
