import { diversityScore } from "../game/encyclopedia";
import { useProgress } from "../hooks/useProgress";
import { useSpeciesData } from "../hooks/useSpeciesData";
import Sprite from "./Sprite";

/** Format a diversity score: whole numbers plain, otherwise one decimal. */
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Diversity score for the HUD: sum of diversity_value of species alive in the domes. */
export default function DiversityCounter() {
  const { sanctuary } = useProgress();
  const data = useSpeciesData();
  const byId = data.status === "ok" ? Object.fromEntries(data.data.list.map((s) => [s.id, s])) : {};
  const score = diversityScore(sanctuary, byId);
  return (
    <span
      className="diversity-counter"
      role="status"
      aria-label={`Diversity score ${fmt(score)}`}
      title="Diversity score: species alive in your domes, weighted by how evolutionarily unique they are"
    >
      <Sprite name="diversity-icon" width={16} height={16} fallback={<span className="diversity-fallback" aria-hidden="true">◆</span>} />
      <span className="diversity-value" aria-hidden="true">
        {fmt(score)}
      </span>
    </span>
  );
}
