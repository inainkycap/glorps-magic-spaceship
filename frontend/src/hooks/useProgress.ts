import { useCallback, useSyncExternalStore } from "react";
import { canAfford, clampFuel, FUEL_COSTS, FUEL_START } from "../game/fuel";
import { defaultSanctuary, isSite, newDome, poolOf, TERRAINS } from "../game/sanctuary";
import { HOME, isPlace } from "../geo";
import type {
  DomeConditions,
  DomeState,
  DomeTerrain,
  NeedKey,
  Place,
  Progress,
  SanctuaryState,
  StoredRun,
} from "../types";

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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** { [id]: non-negative integer } */
const isCountMap = (v: unknown) => isObject(v) && Object.values(v).every((n) => isFiniteNum(n) && n >= 0 && Number.isInteger(n));

function isDome(v: unknown): v is DomeState {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    isFiniteNum(v.site) &&
    isSite(v.site) &&
    TERRAINS.includes(v.terrain as DomeTerrain) &&
    ["temperature", "humidity", "oxygen", "pressure"].every((k) => isFiniteNum(v[k])) &&
    isCountMap(v.residents)
  );
}
const isRun = (v: unknown) => isObject(v) && typeof v.key === "string" && isObject(v.result) && Array.isArray(v.result.years);

/**
 * Drop optional parts that don't validate (e.g. after a format change), rather
 * than throwing away the player's whole progress.
 */
function sanitizeOptional(p: Record<string, unknown>) {
  if (p.rescued !== undefined && !isCountMap(p.rescued)) delete p.rescued;
  if (p.sanctuary !== undefined) {
    const s = p.sanctuary;
    if (!isObject(s) || !Array.isArray(s.domes) || !s.domes.every(isDome)) delete p.sanctuary;
    else {
      if (s.lastRun !== undefined && !isRun(s.lastRun)) delete s.lastRun;
      if (s.prevRun !== undefined && !isRun(s.prevRun)) delete s.prevRun;
    }
  }
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (isObject(parsed)) sanitizeOptional(parsed);
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

// --- Sanctuary -----------------------------------------------------------------

/** Until the player changes anything: one dome on the first site. */
const DEFAULT_SANCTUARY = defaultSanctuary();
const sanctuaryOf = (p: Progress): SanctuaryState => p.sanctuary ?? DEFAULT_SANCTUARY;
const updateSanctuary = (fn: (s: SanctuaryState) => SanctuaryState) =>
  setState((p) => ({ ...p, sanctuary: fn(sanctuaryOf(p)) }));

/** DNA Lab result: add rescued individuals (and mark the species as saved on the map). */
const addRescued = (speciesId: string, count: number) =>
  setState((p) => ({
    ...p,
    rescued: { ...p.rescued, [speciesId]: (p.rescued?.[speciesId] ?? 0) + Math.max(0, Math.round(count)) },
    saved: p.saved.includes(speciesId) ? p.saved : [...p.saved, speciesId],
  }));

/** Build a dome on an empty site, paying fuel. Returns false if taken, invalid or unaffordable. */
const buildDome = (site: number): boolean => {
  if (!isSite(site) || sanctuaryOf(state).domes.some((d) => d.site === site)) return false;
  if (!spendFuel(FUEL_COSTS.buildDome)) return false;
  updateSanctuary((s) => ({ ...s, domes: [...s.domes, newDome(site)].sort((a, b) => a.site - b.site) }));
  return true;
};

/** Change a dome's conditions or name. */
const updateDome = (id: string, patch: Partial<DomeConditions & { name: string }>) =>
  updateSanctuary((s) => ({ ...s, domes: s.domes.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));

/**
 * Move individuals between a dome and the unplaced pool (delta > 0 = into the
 * dome). Clamped to what's in the pool / the dome. Returns how many moved.
 */
const moveResidents = (domeId: string, speciesId: string, delta: number): number => {
  const s = sanctuaryOf(state);
  const dome = s.domes.find((d) => d.id === domeId);
  if (!dome) return 0;
  const inDome = dome.residents[speciesId] ?? 0;
  const inPool = poolOf(state.rescued ?? {}, s.domes)[speciesId] ?? 0;
  const moved = delta > 0 ? Math.min(delta, inPool) : -Math.min(-delta, inDome);
  if (moved === 0) return 0;
  updateSanctuary((cur) => ({
    ...cur,
    domes: cur.domes.map((d) => {
      if (d.id !== domeId) return d;
      const residents = { ...d.residents, [speciesId]: inDome + moved };
      if (residents[speciesId] === 0) delete residents[speciesId];
      return { ...d, residents };
    }),
  }));
  return moved;
};

/** Keep a finished run; the previous one is kept for compare mode. */
const recordRun = (run: StoredRun) =>
  updateSanctuary((s) => ({ ...s, prevRun: s.lastRun, lastRun: run }));

const reset = () => setState(() => EMPTY);

/**
 * Player progress (scanned hotspots, saved species, Glorp's location, fuel,
 * rescued individuals, sanctuary domes), persisted to localStorage and shared
 * by every component in the tab.
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
    /** Individuals rescued per species (DNA Lab), placed or not. */
    rescued: progress.rescued ?? {},
    sanctuary: sanctuaryOf(progress),
    scannedFor,
    discoveredFor,
    discoverNeed,
    markScanned,
    markSaved,
    setGlorp,
    spendFuel,
    addRescued,
    buildDome,
    updateDome,
    moveResidents,
    recordRun,
    reset,
  };
}
