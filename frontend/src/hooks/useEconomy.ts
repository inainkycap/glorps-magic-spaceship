import { useSyncExternalStore } from "react";
import { getEconomy } from "../api";
import type { Economy } from "../types";

// The backend's Zorps numbers (GET /api/economy), loaded once and shared. null
// until loaded; game/zorps.ts falls back to the same numbers built in, so the
// game works before (or without) it.

let economy: Economy | null = null;
let started = false;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!started) {
    started = true;
    getEconomy()
      .then((e) => {
        economy = e;
        listeners.forEach((l) => l());
      })
      .catch(() => {
        /* keep the built-in fallback numbers */
      });
  }
  return () => {
    listeners.delete(fn);
  };
}

/** Current economy (for non-React code such as the progress store). */
export const currentEconomy = () => economy;

export function useEconomy(): Economy | null {
  return useSyncExternalStore(subscribe, () => economy, () => null);
}
