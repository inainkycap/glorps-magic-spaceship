import { useCallback, useEffect, useState } from "react";
import { HOME, isPlace } from "../geo";
import type { Place, Progress } from "../types";

const STORAGE_KEY = "glorp.progress.v1";

const EMPTY: Progress = { scanned: {}, saved: [] };

function isProgress(x: unknown): x is Progress {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.scanned === "object" &&
    p.scanned !== null &&
    !Array.isArray(p.scanned) &&
    Object.values(p.scanned).every(
      (v) => Array.isArray(v) && v.every((s) => typeof s === "string"),
    ) &&
    Array.isArray(p.saved) &&
    p.saved.every((s) => typeof s === "string") &&
    (p.glorp === undefined || isPlace(p.glorp))
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

/**
 * Player progress (scanned hotspots, saved species), persisted to localStorage.
 * Each component gets its own copy; changes in other tabs are picked up via
 * the `storage` event.
 */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(load);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setProgress(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  const markScanned = useCallback(
    (speciesId: string, hotspotId: string) =>
      update((p) => {
        const done = p.scanned[speciesId] ?? [];
        if (done.includes(hotspotId)) return p;
        return {
          ...p,
          scanned: { ...p.scanned, [speciesId]: [...done, hotspotId] },
        };
      }),
    [update],
  );

  const markSaved = useCallback(
    (speciesId: string) =>
      update((p) =>
        p.saved.includes(speciesId)
          ? p
          : { ...p, saved: [...p.saved, speciesId] },
      ),
    [update],
  );

  const setGlorp = useCallback(
    (place: Place) => update((p) => ({ ...p, glorp: place })),
    [update],
  );

  const reset = useCallback(() => update(() => EMPTY), [update]);

  const scannedFor = useCallback(
    (speciesId: string) => progress.scanned[speciesId] ?? [],
    [progress],
  );

  /** Glorp's current place in space and time (HOME before the first trip). */
  const glorp = progress.glorp ?? HOME;

  return { progress, glorp, scannedFor, markScanned, markSaved, setGlorp, reset };
}
