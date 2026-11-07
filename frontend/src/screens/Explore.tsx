import { useState } from "react";
import { Link, useParams } from "react-router";
import { getSpecies } from "../api";
import Status from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";

export default function Explore() {
  const { speciesId = "" } = useParams();
  const state = useAsync(speciesId, () => getSpecies(speciesId));
  const { scannedFor, markScanned } = useProgress();
  const [fact, setFact] = useState<string | null>(null);

  if (state.status !== "ok") return <Status state={state} />;
  const species = state.data;
  const scanned = scannedFor(species.id);
  const dna = species.hotspots.filter((h) => h.dna && scanned.includes(h.id)).length;
  const labReady = dna >= species.dna_required;

  return (
    <section>
      <h1>
        {species.location}, {species.era}
      </h1>
      <p>
        DNA {dna}/{species.dna_required} · Scanned {scanned.length}/
        {species.hotspots.length}
      </p>

      {/* Placeholder scene: hotspots at their % positions */}
      <div className="scene">
        {species.hotspots.map((h) => (
          <button
            key={h.id}
            className={`hotspot ${scanned.includes(h.id) ? "scanned" : ""}`}
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
            title={h.label}
            onClick={() => {
              markScanned(species.id, h.id);
              setFact(`${h.label}: ${h.fact}`);
            }}
          >
            {h.dna ? "DNA" : "?"}
          </button>
        ))}
      </div>

      {fact && <p className="dialog">{fact}</p>}

      {labReady ? (
        <Link className="button w-m" to={`/lab/${species.id}`}>
          Go to Lab ▶
        </Link>
      ) : (
        <p className="muted">Collect {species.dna_required} DNA to open the lab.</p>
      )}
    </section>
  );
}
