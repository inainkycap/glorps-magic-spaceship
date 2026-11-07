import { Link, useParams } from "react-router";
import { getSpecies } from "../api";
import Status from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";

/**
 * DNA Lab: placeholder. The lab becomes a DNA minigame in the next branch; the
 * old intervention picker + simulation UI was removed (api.simulate and the
 * SimulateResponse contract are untouched).
 */
export default function Lab() {
  const { speciesId = "" } = useParams();
  const state = useAsync(speciesId, () => getSpecies(speciesId));
  const { scannedFor } = useProgress();

  if (state.status !== "ok") return <Status state={state} />;
  const species = state.data;
  const scanned = scannedFor(species.id);
  const dna = species.hotspots.filter((h) => h.dna && scanned.includes(h.id)).length;
  const ready = dna >= species.dna_required;

  return (
    <section>
      <h1>DNA Lab: {species.name}</h1>
      <div className="dialog">
        <p>
          DNA fragments: {dna}/{species.dna_required}
        </p>
        {ready ? (
          <p>The DNA minigame is coming in the next update. Glorp is warming up the sequencer…</p>
        ) : (
          <p className="muted">Collect {species.dna_required - dna} more DNA in Explore first.</p>
        )}
      </div>
      <Link className="px-button w-m" to={`/explore/${species.id}`}>
        Back to Explore
      </Link>
    </section>
  );
}
