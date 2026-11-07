import { useCallback, useSyncExternalStore } from "react";
import { canAfford, clampFuel, FUEL_START } from "../game/fuel";
import { HOME, isPlace } from "../geo";
import type { NeedKey, Place, Progress } from "../types";

const STORAGE_KEY = "glorp.progress.v1";

const EMPTY: Progress = { scanned: {}, saved: [] };

/** { [id]: string[] } */
const isStringListMap = (v: unknown) =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((list) => Array.isArray(list) && list.every((s) => typeof s === "string"));

function isProgress(x: unknown): x is Progress {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    isStringListMap(p.scanned) &&
    (p.discovered === undefined || isStringListMap(p.discovered)) &&
    Array.isArray(p.saved) &&
    p.saved.every((s) => typeof s === "string") &&
    (p.glorp === undefined || isPlace(p.glorp)) &&
    (p.fuel === undefined || (typeof p.fuel === "number" && Number.isFinite(p.fuel)))
  );
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY; // storage blocked / private mode / corrupt JSON
  }
}

function persist(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage full or blocked: progress just won't survive a reload
  }
}

// --- one shared store for the whole tab --------------------------------------
// Every useProgress() reads the same state, so e.g. spending fuel on the map
// updates the HUD gauge immediately. Other tabs sync via the `storage` event.

let state: Progress = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function setState(fn: (p: Progress) => Progress) {
  const next = fn(state);
  if (next === state) return;
  state = next;
  persist(next);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    state = load();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const fuelOf = (p: Progress) => clampFuel(p.fuel ?? FUEL_START);

const markScanned = (speciesId: string, hotspotId: string) =>
  setState((p) => {
    const done = p.scanned[speciesId] ?? [];
    if (done.includes(hotspotId)) return p;
    return { ...p, scanned: { ...p.scanned, [speciesId]: [...done, hotspotId] } };
  });

const markSaved = (speciesId: string) =>
  setState((p) => (p.saved.includes(speciesId) ? p : { ...p, saved: [...p.saved, speciesId] }));

/** Record that a species' need was revealed. Returns true if it was new. */
const discoverNeed = (speciesId: string, key: NeedKey): boolean => {
  const known = state.discovered?.[speciesId] ?? [];
  if (known.includes(key)) return false;
  setState((p) => ({ ...p, discovered: { ...p.discovered, [speciesId]: [...known, key] } }));
  return true;
};

const setGlorp = (place: Place) => setState((p) => ({ ...p, glorp: place }));

/** Spend fuel if there's enough. Returns false (and changes nothing) if not. */
const spendFuel = (cost: number): boolean => {
  const fuel = fuelOf(state);
  if (!canAfford(fuel, cost)) return false;
  setState((p) => ({ ...p, fuel: clampFuel(fuel - cost) }));
  return true;
};

const reset = () => setState(() => EMPTY);

/**
 * Player progress (scanned hotspots, saved species, Glorp's location, fuel),
 * persisted to localStorage and shared by every component in the tab.
 */
export function useProgress() {
  const progress = useSyncExternalStore(subscribe, () => state, () => EMPTY);

  const scannedFor = useCallback(
    (speciesId: string) => progress.scanned[speciesId] ?? [],
    [progress],
  );

  const discoveredFor = useCallback(
    (speciesId: string): NeedKey[] => (progress.discovered?.[speciesId] ?? []) as NeedKey[],
    [progress],
  );

  return {
    progress,
    /** Glorp's current place in space and time (HOME before the first trip). */
    glorp: progress.glorp ?? HOME,
    /** Current fuel (FUEL_START before anything has been spent). */
    fuel: fuelOf(progress),
    scannedFor,
    discoveredFor,
    discoverNeed,
    markScanned,
    markSaved,
    setGlorp,
    spendFuel,
    reset,
  };
}
