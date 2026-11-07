import { Link, useParams } from "react-router";
import { getSpecies } from "../api";
import Status from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";

/** Stand-in minigame score until the DNA Lab minigame lands. */
const PLACEHOLDER_RESCUE = 10;

/**
 * DNA Lab: placeholder. The lab becomes a DNA minigame in the next branch
 * (score = individuals rescued). Until then a stand-in button "scores" a fixed
 * number so the Sanctuary can be played. The old intervention picker +
 * simulation UI was removed (api.simulate and its contract are untouched).
 */
export default function Lab() {
  const { speciesId = "" } = useParams();
  const state = useAsync(speciesId, () => getSpecies(speciesId));
  const { scannedFor, rescued, addRescued } = useProgress();

  if (state.status !== "ok") return <Status state={state} />;
  const species = state.data;
  const scanned = scannedFor(species.id);
  const dna = species.hotspots.filter((h) => h.dna && scanned.includes(h.id)).length;
  const ready = dna >= species.dna_required;
  const saved = rescued[species.id] ?? 0;

  return (
    <section>
      <h1>DNA Lab: {species.name}</h1>
      <div className="dialog">
        <p>
          DNA fragments: {dna}/{species.dna_required}
        </p>
        {ready ? (
          <>
            <p>The DNA minigame is coming in the next update. Glorp is warming up the sequencer…</p>
            <p className="muted small">Placeholder until then: the minigame's score is the number of individuals rescued.</p>
            <button className="px-button primary w-l" onClick={() => addRescued(species.id, PLACEHOLDER_RESCUE)}>
              Rescue {PLACEHOLDER_RESCUE} (placeholder)
            </button>
            {saved > 0 && (
              <p>
                Rescued so far: {saved}. <Link to="/sanctuary">Place them in a Sanctuary dome</Link>.
              </p>
            )}
          </>
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
