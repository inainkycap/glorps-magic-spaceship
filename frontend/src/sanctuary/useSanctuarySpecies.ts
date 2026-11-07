import { getSpeciesMany, listSpecies } from "../api";
import { useAsync } from "../hooks/useAsync";
import type { Species } from "../types";

/**
 * Species data the sanctuary needs: every species' name (for labels) and the
 * full files (needs, for fit) of the species the player has rescued/placed.
 */
export function useSanctuarySpecies(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useAsync(`sanctuary:${sorted.join(",")}`, async () => {
    const [summaries, full] = await Promise.all([listSpecies(), getSpeciesMany(sorted)]);
    const byId: Record<string, Species> = Object.fromEntries(full.map((s) => [s.id, s]));
    const names: Record<string, string> = Object.fromEntries(summaries.map((s) => [s.id, s.name]));
    return { byId, nameOf: (id: string) => names[id] ?? byId[id]?.name ?? id };
  });
}
