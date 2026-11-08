// Encyclopedia + progression rules (pure, no React). Documented in CLAUDE.md "Game rules".
//
// - Unlock waves: 3 species to start; rescuing 3 unlocks the next 3; rescuing 6
//   unlocks the rest. Order: species `unlock_wave` (1–3) if the data has it,
//   else by era, most recent first.
// - Completion per species: 7 checklist items (found on map, visited, facts n/total,
//   needs n/total, DNA complete, rescued, thriving), partial items count partly.
// - Diversity score: sum of `diversity_value` (default 1) of species alive in domes.

import { needKeysOf } from "./needs";
import type { Progress, SanctuaryState, Species, SpeciesSummary } from "../types";

// --- Unlock waves ---------------------------------------------------------------------------

export const WAVES = 3;
/** Sizes of waves 1 and 2 when the data has no unlock_wave (wave 3 = the rest). */
export const WAVE_SIZE = 3;
/** Species rescued (in all) needed to unlock wave 1, 2, 3. */
export const UNLOCK_AFTER_RESCUES = [0, 3, 6] as const;

type Waved = Pick<SpeciesSummary, "id" | "era_year" | "unlock_wave">;

const validWave = (w: unknown): w is number => typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= WAVES;

/**
 * Each species' unlock wave (1..3). If ANY species has a valid `unlock_wave`, the
 * data decides (species without one go to the last wave); otherwise sort by era,
 * most recent first (ties by id): the first 3 are wave 1, the next 3 wave 2, the
 * rest wave 3.
 */
export function wavesOf(species: Waved[]): Record<string, number> {
  if (species.some((s) => validWave(s.unlock_wave))) {
    return Object.fromEntries(species.map((s) => [s.id, validWave(s.unlock_wave) ? s.unlock_wave : WAVES]));
  }
  const order = [...species].sort((a, b) => b.era_year - a.era_year || a.id.localeCompare(b.id));
  return Object.fromEntries(order.map((s, i) => [s.id, Math.min(WAVES, Math.floor(i / WAVE_SIZE) + 1)]));
}

/** The highest wave unlocked after rescuing this many species. */
export function unlockedWaveFor(rescuedCount: number): number {
  let wave = 1;
  UNLOCK_AFTER_RESCUES.forEach((need, i) => {
    if (rescuedCount >= need) wave = i + 1;
  });
  return wave;
}

export const isUnlocked = (id: string, waves: Record<string, number>, unlockedWave: number) =>
  (waves[id] ?? WAVES) <= unlockedWave;

/** Species that became visible between two unlock levels (for the reveal effect). */
export const newlyUnlocked = (waves: Record<string, number>, fromWave: number, toWave: number) =>
  Object.keys(waves).filter((id) => waves[id] > fromWave && waves[id] <= toWave);

// --- Thriving + diversity ---------------------------------------------------------------------

/** Animals of each species alive in the domes right now. */
export function aliveInDomes(sanctuary: SanctuaryState | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of sanctuary?.domes ?? []) for (const [id, n] of Object.entries(d.residents)) if (n > 0) out[id] = (out[id] ?? 0) + n;
  return out;
}

/**
 * Thriving = alive in a dome AFTER at least one "Advance 10 years": at least 2 of
 * it came out of the last advance alive, and it's still in a dome now.
 */
export function thrivingIds(sanctuary: SanctuaryState | undefined): string[] {
  const adv = sanctuary?.lastAdvance;
  if (!adv) return [];
  const alive = aliveInDomes(sanctuary);
  const survived: Record<string, number> = {};
  for (const d of adv.result.domes) for (const [id, n] of Object.entries(d.end)) survived[id] = (survived[id] ?? 0) + n;
  return Object.keys(survived).filter((id) => survived[id] >= 2 && (alive[id] ?? 0) > 0);
}

export const DEFAULT_DIVERSITY_VALUE = 1;
export const diversityValueOf = (s: Pick<SpeciesSummary, "diversity_value"> | undefined) =>
  typeof s?.diversity_value === "number" && Number.isFinite(s.diversity_value) && s.diversity_value >= 0
    ? s.diversity_value
    : DEFAULT_DIVERSITY_VALUE;

/** Sum of diversity_value (default 1) over species alive in the domes. */
export function diversityScore(
  sanctuary: SanctuaryState | undefined,
  speciesById: Record<string, Pick<SpeciesSummary, "diversity_value"> | undefined>,
): number {
  const alive = aliveInDomes(sanctuary);
  return Object.keys(alive).reduce((sum, id) => sum + diversityValueOf(speciesById[id]), 0);
}

// --- Completion -------------------------------------------------------------------------------

export type CompletionKey = "found" | "visited" | "facts" | "needs" | "dna" | "rescued" | "thriving";

export interface CompletionItem {
  key: CompletionKey;
  label: string;
  /** 0..1: how much of this item is done (partial for facts/needs). */
  done: number;
  /** "n/total" for countable items. */
  count?: string;
}

export interface Completion {
  items: CompletionItem[];
  /** 0..1: the average of the items. */
  fraction: number;
}

type Countable = Pick<Species, "id" | "hotspots" | "needs">;

/** One species' checklist, from the player's progress. */
export function completionOf(species: Countable, progress: Progress): Completion {
  const id = species.id;
  const has = (list: string[] | undefined) => !!list?.includes(id);
  const scanned = new Set(progress.scanned[id] ?? []).size;
  const facts = species.hotspots.length;
  const needKeys = needKeysOf(species.needs);
  const needs = needKeys.filter((k) => progress.discovered?.[id]?.includes(k)).length;
  const visited = has(progress.visited);
  const items: CompletionItem[] = [
    { key: "found", label: "Found on the map", done: isFound(id, progress) ? 1 : 0 },
    { key: "visited", label: "Visited its world", done: visited ? 1 : 0 },
    { key: "facts", label: "Facts scanned", done: facts ? Math.min(1, scanned / facts) : 1, count: `${Math.min(scanned, facts)}/${facts}` },
    { key: "needs", label: "Needs discovered", done: needKeys.length ? needs / needKeys.length : 1, count: `${needs}/${needKeys.length}` },
    { key: "dna", label: "DNA complete", done: has(progress.dnaComplete) ? 1 : 0 },
    { key: "rescued", label: "Rescued", done: has(progress.saved) ? 1 : 0 },
    { key: "thriving", label: "Thriving in the sanctuary", done: thrivingIds(progress.sanctuary).includes(id) ? 1 : 0 },
  ];
  return { items, fraction: items.reduce((s, it) => s + it.done, 0) / items.length };
}

/** Average completion over all species (locked ones count as 0). */
export function overallCompletion(species: Countable[], progress: Progress): number {
  if (species.length === 0) return 0;
  return species.reduce((s, sp) => s + completionOf(sp, progress).fraction, 0) / species.length;
}

/**
 * Revealed = VISITED (Glorp arrived in its world and the intro was shown). Only then
 * do its name and real portrait show, on the map pin and in the encyclopedia.
 * Opening its pin ("found") counts for the checklist and Zorps but reveals nothing.
 */
export const isRevealed = (id: string, progress: Partial<Progress>) => !!progress.visited?.includes(id);

/** Its pin has been opened (or it was visited): the "found on the map" checklist item. */
export const isFound = (id: string, progress: Partial<Progress>) =>
  !!progress.found?.includes(id) || isRevealed(id, progress);

/** The goal: every species rescued and thriving. */
export function isComplete(species: Pick<SpeciesSummary, "id">[], progress: Progress): boolean {
  if (species.length === 0) return false;
  const thriving = thrivingIds(progress.sanctuary);
  return species.every((s) => progress.saved.includes(s.id) && thriving.includes(s.id));
}

export const pctText = (f: number) => `${Math.round(f * 100)}%`;
