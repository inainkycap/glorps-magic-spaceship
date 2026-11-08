import { useCallback, useSyncExternalStore } from "react";
import {
  CAPACITY_STEP,
  capacityOf,
  DEFAULT_DOME_CAPACITY,
  defaultSanctuary,
  isInfected,
  isSite,
  MAX_DOME_CAPACITY,
  newDome,
  placedOf,
  roomIn,
  TERRAINS,
} from "../game/sanctuary";
import { canAfford, capacityUpgradeCost, domeCost, REWARDS, startZorps } from "../game/zorps";
import { HOME, isPlace } from "../geo";
import type {
  DnaResult,
  DomeConditions,
  DomeState,
  DomeTerrain,
  NeedKey,
  Place,
  Progress,
  SanctuaryState,
  StoredAdvance,
  StoredRun,
} from "../types";
import { currentEconomy } from "./useEconomy";

const STORAGE_KEY = "glorp.progress.v1";

const EMPTY: Progress = { scanned: {}, saved: [] };

// --- validation + migration of saved progress ----------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStringList = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
/** { [id]: string[] } */
const isStringListMap = (v: unknown) => isObject(v) && Object.values(v).every(isStringList);
/** { [id]: non-negative integer } */
const isCountMap = (v: unknown) => isObject(v) && Object.values(v).every((n) => isFiniteNum(n) && n >= 0 && Number.isInteger(n));

function isProgress(x: unknown): x is Progress {
  if (!isObject(x)) return false;
  return (
    isStringListMap(x.scanned) &&
    (x.discovered === undefined || isStringListMap(x.discovered)) &&
    isStringList(x.saved) &&
    (x.glorp === undefined || isPlace(x.glorp)) &&
    (x.zorps === undefined || isFiniteNum(x.zorps))
  );
}

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
const isOutbreak = (v: unknown) => isObject(v) && isFiniteNum(v.years_left) && isFiniteNum(v.severity);
/** Drop a dome's optional parts that don't validate (capacity, outbreak, exposure). */
function cleanDome(d: Record<string, unknown>) {
  if (d.capacity !== undefined && !(isFiniteNum(d.capacity) && d.capacity >= 1)) delete d.capacity;
  if (d.outbreak !== undefined && d.outbreak !== null && !isOutbreak(d.outbreak)) delete d.outbreak;
  if (d.exposed !== undefined && !isCountMap(d.exposed)) delete d.exposed;
}
const isAdvance = (v: unknown) =>
  isObject(v) && isFiniteNum(v.toYear) && isObject(v.result) && Array.isArray(v.result.domes);

/**
 * Migrate old saves and drop optional parts that don't validate, rather than
 * throwing away the player's whole progress.
 */
export function migrate(p: Record<string, unknown>) {
  delete p.fuel; // fuel was replaced by Zorps: old saves start with the Zorps start amount
  if (p.zorps !== undefined && !isFiniteNum(p.zorps)) delete p.zorps;
  if (p.rescued !== undefined && !isCountMap(p.rescued)) delete p.rescued;
  if (p.pool !== undefined && !isCountMap(p.pool)) delete p.pool;
  if (p.poolExposed !== undefined && !isCountMap(p.poolExposed)) delete p.poolExposed;
  if (p.dnaComplete !== undefined && !isStringList(p.dnaComplete)) delete p.dnaComplete;
  if (
    p.dnaBest !== undefined &&
    !(isObject(p.dnaBest) && Object.values(p.dnaBest).every((r) => isObject(r) && isFiniteNum(r.quality) && isFiniteNum(r.individuals)))
  )
    delete p.dnaBest;
  if (p.sanctuary !== undefined) {
    const s = p.sanctuary;
    if (!isObject(s) || !Array.isArray(s.domes) || !s.domes.every(isDome)) delete p.sanctuary;
    else {
      (s.domes as unknown as Record<string, unknown>[]).forEach(cleanDome);
      if (s.lastRun !== undefined && !isRun(s.lastRun)) delete s.lastRun;
      if (s.prevRun !== undefined && !isRun(s.prevRun)) delete s.prevRun;
      if (s.lastAdvance !== undefined && !isAdvance(s.lastAdvance)) delete s.lastAdvance;
      if (s.year !== undefined && !isFiniteNum(s.year)) delete s.year;
    }
  }
  // Before the explicit pool: unplaced animals were "rescued − placed".
  if (p.pool === undefined && isObject(p.rescued)) {
    const placed = placedOf(isObject(p.sanctuary) ? ((p.sanctuary as unknown as SanctuaryState).domes ?? []) : []);
    p.pool = Object.fromEntries(
      Object.entries(p.rescued as Record<string, number>).map(([id, n]) => [id, Math.max(0, n - (placed[id] ?? 0))]),
    );
  }
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (isObject(parsed)) migrate(parsed);
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

// --- one shared store for the whole tab ------------------------------------------------
// Every useProgress() reads the same state, so e.g. spending Zorps on the map
// updates the HUD immediately. Other tabs sync via the `storage` event.

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

// --- Zorps -------------------------------------------------------------------------------

export interface ZorpsGain {
  id: number;
  amount: number;
  reason: string;
}
const gainListeners = new Set<(g: ZorpsGain) => void>();
let gainId = 0;
/** Subscribe to Zorps gains (for the "+N Zorps" popups). Returns an unsubscribe. */
export function onZorpsGain(fn: (g: ZorpsGain) => void) {
  gainListeners.add(fn);
  return () => {
    gainListeners.delete(fn);
  };
}

const zorpsOf = (p: Progress) => Math.max(0, Math.round(p.zorps ?? startZorps(currentEconomy())));

/** Earn Zorps (shows a "+N Zorps" popup). */
const earnZorps = (amount: number, reason: string) => {
  const n = Math.round(amount);
  if (n <= 0) return;
  const balance = zorpsOf(state);
  setState((p) => ({ ...p, zorps: balance + n }));
  const g = { id: ++gainId, amount: n, reason };
  gainListeners.forEach((fn) => fn(g));
};

/** Spend Zorps if there are enough. Returns false (and changes nothing) if not. */
const spendZorps = (cost: number): boolean => {
  const balance = zorpsOf(state);
  if (!canAfford(balance, cost)) return false;
  setState((p) => ({ ...p, zorps: balance - Math.max(0, Math.round(cost)) }));
  return true;
};

// --- Explore / encyclopedia ------------------------------------------------------------------

/** Record a scan. Returns true (and pays the "new fact" reward) the first time. */
const markScanned = (speciesId: string, hotspotId: string): boolean => {
  const done = state.scanned[speciesId] ?? [];
  if (done.includes(hotspotId)) return false;
  setState((p) => ({ ...p, scanned: { ...p.scanned, [speciesId]: [...(p.scanned[speciesId] ?? []), hotspotId] } }));
  earnZorps(REWARDS.newFact, "New fact");
  return true;
};

/** Record that a species' need was revealed. Returns true (and pays) if it was new. */
const discoverNeed = (speciesId: string, key: NeedKey): boolean => {
  const known = state.discovered?.[speciesId] ?? [];
  if (known.includes(key)) return false;
  setState((p) => ({ ...p, discovered: { ...p.discovered, [speciesId]: [...(p.discovered?.[speciesId] ?? []), key] } }));
  earnZorps(REWARDS.newNeed, "New need discovered");
  return true;
};

/** The species' DNA set is complete: pays once. */
const markDnaComplete = (speciesId: string): boolean => {
  if (state.dnaComplete?.includes(speciesId)) return false;
  setState((p) => ({ ...p, dnaComplete: [...(p.dnaComplete ?? []), speciesId] }));
  earnZorps(REWARDS.dnaComplete, "DNA complete");
  return true;
};

const setGlorp = (place: Place) => setState((p) => ({ ...p, glorp: place }));

/**
 * Record a DNA Lab run. The BEST run per species counts: when a run beats the
 * best, the extra animals go to the unplaced pool (a worse retry never takes any
 * away). The first rescue of a species pays the "rescue" reward. Returns whether
 * this run is the new best.
 */
const recordDnaResult = (speciesId: string, result: DnaResult): boolean => {
  const prev = state.dnaBest?.[speciesId];
  const isBest = !prev || result.individuals > prev.individuals || (result.individuals === prev.individuals && result.quality > prev.quality);
  const extra = Math.max(0, result.individuals - (prev?.individuals ?? 0));
  setState((p) => {
    const best = isBest ? result : p.dnaBest![speciesId];
    return {
      ...p,
      dnaBest: { ...p.dnaBest, [speciesId]: best },
      rescued: { ...p.rescued, [speciesId]: Math.max(p.rescued?.[speciesId] ?? 0, best.individuals) },
      pool: { ...p.pool, [speciesId]: (p.pool?.[speciesId] ?? 0) + extra },
      saved: p.saved.includes(speciesId) ? p.saved : [...p.saved, speciesId],
    };
  });
  if (!prev) earnZorps(REWARDS.rescue, "Species rescued");
  return isBest;
};

// --- Sanctuary ------------------------------------------------------------------------------

/** Until the player changes anything: one dome on the first site. */
const DEFAULT_SANCTUARY = defaultSanctuary();
const sanctuaryOf = (p: Progress): SanctuaryState => p.sanctuary ?? DEFAULT_SANCTUARY;
const updateSanctuary = (fn: (s: SanctuaryState) => SanctuaryState) =>
  setState((p) => ({ ...p, sanctuary: fn(sanctuaryOf(p)) }));

/** Build a dome on an empty site, paying Zorps. Returns false if taken, invalid or unaffordable. */
const buildDome = (site: number): boolean => {
  if (!isSite(site) || sanctuaryOf(state).domes.some((d) => d.site === site)) return false;
  if (!spendZorps(domeCost(currentEconomy()))) return false;
  updateSanctuary((s) => ({ ...s, domes: [...s.domes, newDome(site)].sort((a, b) => a.site - b.site) }));
  return true;
};

/** Change a dome's conditions or name. */
const updateDome = (id: string, patch: Partial<DomeConditions & { name: string }>) =>
  updateSanctuary((s) => ({ ...s, domes: s.domes.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));

/** Set a count in a count map, dropping zeros. */
const withCount = (m: Record<string, number> | undefined, id: string, n: number) => {
  const out = { ...m, [id]: Math.max(0, n) };
  if (out[id] === 0) delete out[id];
  return out;
};

/**
 * Move animals between a dome and the unplaced pool (delta > 0 = into the dome).
 * Clamped to what's in the pool / the dome, and to the dome's free capacity.
 * Animals leaving an infected dome are marked "exposed" (they may carry the
 * outbreak); placing exposed animals in another dome sends them as
 * `from_infected` with the next request. Returns how many moved.
 */
const moveResidents = (domeId: string, speciesId: string, delta: number): number => {
  const dome = sanctuaryOf(state).domes.find((d) => d.id === domeId);
  if (!dome) return 0;
  const inDome = dome.residents[speciesId] ?? 0;
  const inPool = state.pool?.[speciesId] ?? 0;
  const moved = delta > 0 ? Math.min(delta, inPool, roomIn(dome)) : -Math.min(-delta, inDome);
  if (moved === 0) return 0;
  const domeExposed = Math.min(inDome, dome.exposed?.[speciesId] ?? 0);
  const poolExposed = Math.min(inPool, state.poolExposed?.[speciesId] ?? 0);
  // How many exposed animals change sides.
  let toPool = 0; // exposed animals going dome → pool
  let toDome = 0; // exposed animals going pool → dome
  if (moved < 0) toPool = isInfected(dome) ? -moved : Math.min(-moved, domeExposed);
  else toDome = Math.min(moved, poolExposed);
  setState((p) => ({
    ...p,
    pool: { ...p.pool, [speciesId]: inPool - moved },
    poolExposed: withCount(p.poolExposed, speciesId, poolExposed - toDome + toPool),
    sanctuary: {
      ...sanctuaryOf(p),
      domes: sanctuaryOf(p).domes.map((d) => {
        if (d.id !== domeId) return d;
        const residents = withCount(d.residents, speciesId, inDome + moved);
        // An infected dome doesn't track exposure: everyone inside is exposed already.
        const exposedHere = isInfected(d) ? 0 : moved < 0 ? domeExposed - toPool : domeExposed + toDome;
        const exposed = withCount(d.exposed, speciesId, exposedHere);
        return { ...d, residents, exposed };
      }),
    },
  }));
  return moved;
};

/** Upgrade a dome's capacity (+CAPACITY_STEP) for Zorps. Returns false if maxed or unaffordable. */
const upgradeCapacity = (domeId: string): boolean => {
  const dome = sanctuaryOf(state).domes.find((d) => d.id === domeId);
  if (!dome || capacityOf(dome) >= MAX_DOME_CAPACITY) return false;
  if (!spendZorps(capacityUpgradeCost(capacityOf(dome), DEFAULT_DOME_CAPACITY, CAPACITY_STEP))) return false;
  updateSanctuary((s) => ({
    ...s,
    domes: s.domes.map((d) => (d.id === domeId ? { ...d, capacity: Math.min(MAX_DOME_CAPACITY, capacityOf(d) + CAPACITY_STEP) } : d)),
  }));
  return true;
};

/** Keep a finished forecast; the previous one is kept for compare mode. */
const recordRun = (run: StoredRun) => updateSanctuary((s) => ({ ...s, prevRun: s.lastRun, lastRun: run }));

/**
 * Apply one realised future ("Advance 10 years"): each dome's populations are
 * replaced by the survivors (which may have grown), each dome's outbreak state
 * is replaced by the one at the end, exposure is cleared (the backend has decided
 * whether moved animals brought an outbreak), the clock moves on, the report is
 * kept, and the payout is paid.
 */
const applyAdvance = (adv: StoredAdvance) => {
  const ends = new Map(adv.result.domes.map((d) => [d.id, d]));
  setState((p) => {
    const s = sanctuaryOf(p);
    return {
      ...p,
      poolExposed: undefined,
      sanctuary: {
        ...s,
        year: adv.toYear,
        lastAdvance: adv,
        domes: s.domes.map((d) => {
          const res = ends.get(d.id);
          if (!res) return { ...d, exposed: undefined };
          const residents = Object.fromEntries(Object.entries(res.end).filter(([, n]) => n > 0).map(([id, n]) => [id, Math.round(n)]));
          const ob = res.outbreak && res.outbreak.years_left > 0 ? res.outbreak : null;
          return { ...d, residents, outbreak: ob, exposed: undefined };
        }),
      },
    };
  });
  earnZorps(adv.zorps, "Thriving species");
};

const reset = () => setState(() => EMPTY);

/**
 * Player progress (scans, needs, Glorp's location, Zorps, rescued animals,
 * sanctuary domes), persisted to localStorage and shared by every component.
 */
export function useProgress() {
  const progress = useSyncExternalStore(subscribe, () => state, () => EMPTY);

  const scannedFor = useCallback((speciesId: string) => progress.scanned[speciesId] ?? [], [progress]);
  const discoveredFor = useCallback(
    (speciesId: string): NeedKey[] => (progress.discovered?.[speciesId] ?? []) as NeedKey[],
    [progress],
  );

  return {
    progress,
    /** Glorp's current place in space and time (HOME before the first trip). */
    glorp: progress.glorp ?? HOME,
    /** Zorps balance (the starting amount until something is spent or earned). */
    zorps: zorpsOf(progress),
    /** Best DNA Lab result per species (animals rescued). */
    rescued: progress.rescued ?? {},
    /** Rescued animals not yet placed in a dome. */
    pool: progress.pool ?? {},
    /** Pool animals that came out of an infected dome since the last advance. */
    poolExposed: progress.poolExposed ?? {},
    sanctuary: sanctuaryOf(progress),
    scannedFor,
    discoveredFor,
    discoverNeed,
    markScanned,
    markDnaComplete,
    setGlorp,
    spendZorps,
    earnZorps,
    recordDnaResult,
    buildDome,
    updateDome,
    moveResidents,
    upgradeCapacity,
    recordRun,
    applyAdvance,
    reset,
  };
}
