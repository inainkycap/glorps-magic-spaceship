import { useState } from "react";
import { Link, useParams } from "react-router";
import { getSpecies } from "../api";
import GlorpSprite from "../components/GlorpSprite";
import Status from "../components/Status";
import { dnaDifficulty, individualsFromQuality, makeStrand, quality, type Base, type Strand } from "../game/dna";
import { canAfford, FUEL_COSTS } from "../game/fuel";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";
import DnaGame from "../lab/DnaGame";
import type { DnaResult } from "../types";

type Phase = { kind: "intro" } | { kind: "play"; strand: Strand; key: number } | { kind: "result"; result: DnaResult; isBest: boolean };

const pct = (q: number) => `${Math.round(q * 100)}%`;
const plural = (n: number, name: string) => `${n} ${name.toLowerCase()}${n === 1 ? "" : "s"}`;

/**
 * DNA Lab minigame (frontend-only): pair each base of the species' DNA against
 * the clock. Quality → individuals rescued (4–20); the best run counts and goes
 * to the Sanctuary's unplaced pool. Retrying costs fuel (fuel.ts).
 */
export default function Lab() {
  const { speciesId = "" } = useParams();
  const state = useAsync(speciesId, () => getSpecies(speciesId));
  const { scannedFor, fuel, spendFuel, recordDnaResult, progress } = useProgress();
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });

  if (state.status !== "ok") return <Status state={state} />;
  const species = state.data;
  const scanned = scannedFor(species.id);
  const dna = species.hotspots.filter((h) => h.dna && scanned.includes(h.id)).length;
  const ready = dna >= species.dna_required;
  const difficulty = dnaDifficulty(species.era_year);
  const best = progress.dnaBest?.[species.id];
  const retryCost = best ? FUEL_COSTS.dnaRetry : 0; // first attempt is free
  const affordable = canAfford(fuel, retryCost);

  const start = () => {
    if (retryCost > 0 && !spendFuel(retryCost)) return;
    setPhase({ kind: "play", strand: makeStrand(difficulty), key: Date.now() });
  };

  const finish = (strand: Strand, answers: (Base | null)[]) => {
    const q = quality(strand.bases, answers);
    const result = { quality: q, individuals: individualsFromQuality(q) };
    const isBest = recordDnaResult(species.id, result);
    setPhase({ kind: "result", result, isBest });
  };

  const startButton = (label: string) => (
    <button className="px-button primary w-l" onClick={start} disabled={!affordable}>
      {retryCost > 0 ? `${label} ⛽${retryCost}` : label}
    </button>
  );

  return (
    <section className="lab">
      <h1>DNA Lab: {species.name}</h1>

      {!ready ? (
        <div className="dialog">
          <p>
            DNA fragments: {dna}/{species.dna_required}
          </p>
          <p className="muted">Collect {species.dna_required - dna} more DNA in Explore first.</p>
        </div>
      ) : phase.kind === "intro" ? (
        <div className="dialog lab-intro">
          <p>
            Rebuild the {species.name.toLowerCase()}'s DNA: for each base, pick its partner. <strong>A↔T</strong>,{" "}
            <strong>C↔G</strong>.
          </p>
          <p className="small">
            {species.era} DNA: {difficulty.bases} bases, {difficulty.degraded} degraded ("?" flashes its letter when its
            turn comes), {difficulty.seconds} seconds.
          </p>
          <p className="small">
            The better the match, the more individuals Glorp rescues (4 to 20). Your best run counts.
          </p>
          {best && (
            <p className="small">
              Best so far: {pct(best.quality)} intact, {plural(best.individuals, species.name)} rescued.
            </p>
          )}
          {startButton(best ? "Try again" : "Start")}
          {!affordable && <p className="error small">Not enough fuel to retry (you have {fuel}).</p>}
        </div>
      ) : phase.kind === "play" ? (
        <DnaGame
          key={phase.key}
          strand={phase.strand}
          seconds={difficulty.seconds}
          onFinish={(answers) => finish(phase.strand, answers)}
        />
      ) : (
        <div className="lab-result">
          <div className="lab-glorp" aria-hidden="true">
            <GlorpSprite size={64} variant="talk" />
          </div>
          <div className="lab-bubble" role="status">
            <p>
              {phase.isBest
                ? `Zib! The DNA came out ${pct(phase.result.quality)} intact. I rescued ${plural(phase.result.individuals, species.name)}!`
                : `This one came out ${pct(phase.result.quality)} intact (${phase.result.individuals}). Your best is still ${plural(best!.individuals, species.name)}, so I'll keep that.`}
            </p>
            <div className="bubble-actions">
              <Link className="px-button primary w-l" to="/sanctuary">
                Send to Sanctuary
              </Link>
              {startButton("Retry")}
            </div>
            {!affordable && <p className="error small">Not enough fuel to retry (you have {fuel}).</p>}
          </div>
        </div>
      )}

      <Link className="px-button w-m" to={`/explore/${species.id}`}>
        Back to Explore
      </Link>
    </section>
  );
}
