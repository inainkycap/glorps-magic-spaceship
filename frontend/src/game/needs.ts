// Display helpers for species needs (see "Proposed: species content + needs" in CLAUDE.md).
// Text sticks to characters the pixel font has: no ≥, en dash or typographic minus.

import type { Hotspot, Need, NeedBound, NeedKey } from "../types";

/** Display order in the field guide. */
export const NEED_KEYS: NeedKey[] = ["terrain", "temperature", "humidity", "oxygen", "pressure"];

export const NEED_LABEL: Record<NeedKey, string> = {
  terrain: "Terrain",
  temperature: "Temperature",
  humidity: "Humidity",
  oxygen: "Oxygen",
  pressure: "Air pressure",
};

const bound = (b: NeedBound) => String(b).trim();

/** "~18 to ~30 °C", "at least 5 %", a terrain description, or null if there's nothing to show. */
export function formatNeed(n: Need): string | null {
  if (n.value) return n.value;
  const unit = n.unit ? ` ${n.unit}` : "";
  const hasMin = n.min !== undefined && n.min !== "";
  const hasMax = n.max !== undefined && n.max !== "";
  if (hasMin && hasMax) return `${bound(n.min!)} to ${bound(n.max!)}${unit}`;
  if (hasMin) return `at least ${bound(n.min!)}${unit}`;
  if (hasMax) return `up to ${bound(n.max!)}${unit}`;
  return null;
}

/** A hotspot's `reveals` as a list (it may be one key, several, or absent). */
export function revealsOf(h: Pick<Hotspot, "reveals">): NeedKey[] {
  if (!h.reveals) return [];
  const keys = Array.isArray(h.reveals) ? h.reveals : [h.reveals];
  return NEED_KEYS.filter((k) => keys.includes(k)); // known keys only, display order, no dupes
}

/** "temperature", "oxygen and air pressure", "terrain, humidity and air pressure" */
function joinLabels(keys: NeedKey[]): string {
  const names = keys.map((k) => NEED_LABEL[k].toLowerCase());
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "New: ideal temperature discovered!" / "New: ideal oxygen and air pressure discovered!" */
export function discoveryMessage(keys: NeedKey | NeedKey[]): string {
  return `New: ideal ${joinLabels(Array.isArray(keys) ? keys : [keys])} discovered!`;
}

/** "Ideal oxygen and air pressure: in your field guide" (re-scan of known needs). */
export function knownMessage(keys: NeedKey[]): string {
  const s = joinLabels(keys);
  return `Ideal ${s}: in your field guide`;
}

/** Needs this species has content for, in display order. */
export function needKeysOf(needs: Partial<Record<NeedKey, Need>> | undefined): NeedKey[] {
  return NEED_KEYS.filter((k) => needs?.[k] !== undefined);
}
