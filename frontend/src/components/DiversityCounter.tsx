import { diversityScore } from "../game/encyclopedia";
import { useProgress } from "../hooks/useProgress";
import { useSpeciesData } from "../hooks/useSpeciesData";
import DiversityIcon from "./DiversityIcon";

/** Format a diversity score: whole numbers plain, otherwise one decimal. */
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "◆ Diversity N" for the HUD and the encyclopedia: sum of diversity_value of species alive in the domes. */
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
      <DiversityIcon />
      <span className="diversity-label" aria-hidden="true">
        Diversity
      </span>
      <span className="diversity-value" aria-hidden="true">
        {fmt(score)}
      </span>
    </span>
  );
}
