import { useId, useState } from "react";
import Sprite from "../components/Sprite";
import { hasSurvivalCurves } from "../game/sanctuary";
import type { StoredRun } from "../types";
import SpeciesFanChart from "./SpeciesFanChart";
import SurvivalChart from "./SurvivalChart";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function Delta({ now, was }: { now: number; was: number }) {
  const d = now - was;
  if (Math.abs(d) < 0.005) return <span className="delta same">(same as before)</span>;
  return (
    <span className={`delta ${d > 0 ? "up" : "down"}`}>
      ({d > 0 ? "+" : ""}
      {fmt(Math.round(d * 100) / 100)} vs before)
    </span>
  );
}

/**
 * A forecast of 1,000 futures for all domes together. Main chart: each
 * species' chance of still being alive, by year, plus expected species alive.
 * The band chart (species alive: 5–95% and 25–75% of futures) sits behind
 * "Details", and is the main chart if the backend doesn't send per-species
 * curves. With `previous` (compare mode) the old forecast is overlaid, faded.
 */
export default function RunResults({
  run,
  previous,
  stale,
  nameOf,
}: {
  run: StoredRun;
  previous: StoredRun | null;
  /** Domes changed since this forecast. */
  stale: boolean;
  nameOf: (id: string) => string;
}) {
  const [details, setDetails] = useState(false);
  const detailsId = useId();
  const r = run.result;
  const total = r.per_species.length;
  const curves = hasSurvivalCurves(r);
  const prevSurv = new Map(previous?.result.per_species.map((s) => [s.species_id, s.survival_probability]));

  const bandChart = (
    <div className="fan-wrap">
      <SpeciesFanChart run={r} previous={previous?.result} speciesTotal={total} />
      <ul className="fan-legend">
        <li><span className="sw band90" /> 90% of futures</li>
        <li><span className="sw band50" /> 50% of futures</li>
        <li><span className="sw median" /> median</li>
        <li><span className="sw p5" /> worst case (5%)</li>
        {previous && <li><span className="sw p5prev" /> previous worst case</li>}
      </ul>
    </div>
  );

  return (
    <section className="run-results" aria-live="polite">
      <header className="run-results-head">
        <h2>Forecast: 1,000 futures · {run.label}</h2>
        {stale && <p className="stale">The sanctuary changed since this forecast: forecast again to update.</p>}
      </header>

      <div className="run-metrics">
        <div className="metric">
          <span className="metric-label">Expected species saved</span>
          <span className="metric-value">
            {fmt(Math.round(r.expected_species_saved * 100) / 100)} / {total}
          </span>
          {previous && <Delta now={r.expected_species_saved} was={previous.result.expected_species_saved} />}
        </div>
        <div className="metric">
          <span className="metric-label">Worst case (5th percentile)</span>
          <span className="metric-value">
            {fmt(r.worst_case_species_saved)} / {total}
          </span>
          {previous && <Delta now={r.worst_case_species_saved} was={previous.result.worst_case_species_saved} />}
        </div>
      </div>

      {curves ? (
        <div className="fan-wrap">
          <SurvivalChart run={r} previous={previous?.result} nameOf={nameOf} />
          {previous && <p className="small muted">Faded lines: the previous forecast ({previous.label}).</p>}
        </div>
      ) : (
        bandChart
      )}

      <button className="px-button details-toggle" aria-expanded={details} aria-controls={detailsId} onClick={() => setDetails((d) => !d)}>
        {details ? "Hide details" : "Details"}
      </button>
      {details && (
        <div id={detailsId}>
          {curves && bandChart}
          <h3>Survival by species (after {r.years[r.years.length - 1]} years)</h3>
          <ul className="species-survival">
            {r.per_species.map((s) => (
              <li key={s.species_id}>
                <Sprite name={`resident-${s.species_id}`} width={16} height={16} frames={2} animate={false} fallback={null} />
                <span className="ss-name">{nameOf(s.species_id)}</span>
                <span className="bar" aria-hidden="true">
                  <span className="bar-fill" style={{ width: pct(s.survival_probability) }} />
                  {prevSurv.has(s.species_id) && (
                    <span className="bar-prev" style={{ left: pct(prevSurv.get(s.species_id)!) }} title="previous forecast" />
                  )}
                </span>
                <span className="ss-pct">{pct(s.survival_probability)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">
        A species counts as saved if any dome still has it. Disasters strike one dome at a time, so splitting a
        species across domes protects it.
      </p>
    </section>
  );
}
