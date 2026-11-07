import { useState } from "react";
import { Link, useParams } from "react-router";
import { getSpecies, simulate } from "../api";
import Status from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";
import type { SimulateResponse } from "../types";

export default function Lab() {
  const { speciesId = "" } = useParams();
  const state = useAsync(speciesId, () => getSpecies(speciesId));
  const { scannedFor, markSaved, progress } = useProgress();
  const [chosen, setChosen] = useState<string[]>([]);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  if (state.status !== "ok") return <Status state={state} />;
  const species = state.data;
  const scanned = scannedFor(species.id);
  const unlocked = new Set(
    species.hotspots
      .filter((h) => h.unlocks !== null && scanned.includes(h.id))
      .map((h) => h.unlocks as string),
  );

  const toggle = (id: string) =>
    setChosen((c) =>
      c.includes(id)
        ? c.filter((x) => x !== id)
        : c.length < species.max_interventions
          ? [...c, id]
          : c,
    );

  const run = async () => {
    setRunning(true);
    setSimError(null);
    try {
      setResult(
        await simulate({ species_id: species.id, interventions: chosen, runs: 1000 }),
      );
    } catch (e) {
      setSimError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <h1>Lab: {species.name}</h1>
      <p className="muted">
        Pick up to {species.max_interventions} tools. Goal:{" "}
        {Math.round(species.goal_survival * 100)}% survival.
      </p>

      <ul className="card-list">
        {species.interventions.map((iv) => {
          const isUnlocked = unlocked.has(iv.id);
          return (
            <li key={iv.id} className={`card ${isUnlocked ? "" : "locked"}`}>
              <label>
                <input
                  type="checkbox"
                  disabled={!isUnlocked}
                  checked={chosen.includes(iv.id)}
                  onChange={() => toggle(iv.id)}
                />{" "}
                {isUnlocked ? iv.name : "??? (scan more)"}
              </label>
              {isUnlocked && <p className="muted">{iv.description}</p>}
            </li>
          );
        })}
      </ul>

      <button className="button" onClick={run} disabled={running}>
        {running ? "Simulating…" : "Run 1,000 futures ▶"}
      </button>
      {simError && <p className="error">Error: {simError}</p>}

      {/* Placeholder until the fan chart exists */}
      {result && (
        <div className="dialog">
          <p>
            Survival: {Math.round(result.survival_probability * 100)}% —{" "}
            {result.success ? (
              <span className="ok">Success!</span>
            ) : (
              <span className="error">Not enough.</span>
            )}
          </p>
          {result.success &&
            (progress.saved.includes(species.id) ? (
              <Link className="button" to="/sanctuary">
                View Sanctuary ▶
              </Link>
            ) : (
              <button className="button" onClick={() => markSaved(species.id)}>
                Save to Sanctuary
              </button>
            ))}
        </div>
      )}

      <p>
        <Link to={`/explore/${species.id}`}>◀ Back to {species.location}</Link>
      </p>
    </section>
  );
}
