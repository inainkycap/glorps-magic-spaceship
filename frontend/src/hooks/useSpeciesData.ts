import { useSyncExternalStore } from "react";
import { getSpeciesMany, listSpecies } from "../api";
import { wavesOf } from "../game/encyclopedia";
import type { Species, SpeciesSummary } from "../types";

export interface SpeciesData {
  /** Every species (summaries), as the API lists them. */
  list: SpeciesSummary[];
  /** Full species files (for completion counts: hotspots, needs). */
  byId: Record<string, Species>;
  /** Unlock wave (1–3) per species id. */
  waves: Record<string, number>;
}

export type SpeciesDataState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ok"; data: SpeciesData };

// One shared load for the whole tab: the map, encyclopedia, HUD and end screen all need it.
let state: SpeciesDataState = { status: "loading" };
let started = false;
const listeners = new Set<() => void>();

function load() {
  started = true;
  state = { status: "loading" };
  listeners.forEach((l) => l());
  listSpecies()
    .then(async (list) => {
      const full = await getSpeciesMany(list.map((s) => s.id));
      const byId = Object.fromEntries(full.map((s) => [s.id, s]));
      // diversity_value / unlock_wave may only be in the full file: prefer the summary, else the file.
      const merged = list.map((s) => ({
        ...s,
        diversity_value: s.diversity_value ?? byId[s.id]?.diversity_value,
        unlock_wave: s.unlock_wave ?? byId[s.id]?.unlock_wave,
      }));
      state = { status: "ok", data: { list: merged, byId, waves: wavesOf(merged) } };
    })
    .catch((e: unknown) => {
      state = { status: "error", error: e instanceof Error ? e : new Error(String(e)) };
      started = false; // a later mount retries
    })
    .finally(() => listeners.forEach((l) => l()));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!started) load();
  return () => {
    listeners.delete(fn);
  };
}

/** All species (summaries + full files + unlock waves), loaded once and shared. */
export function useSpeciesData(): SpeciesDataState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
