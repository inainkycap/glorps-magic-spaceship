import Sprite from "../components/Sprite";
import type { StoredRun } from "../types";
import SpeciesFanChart from "./SpeciesFanChart";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function Delta({ now, was, unit = "" }: { now: number; was: number; unit?: string }) {
  const d = now - was;
  if (Math.abs(d) < 0.005) return <span className="delta same">(same as before)</span>;
  return (
    <span className={`delta ${d > 0 ? "up" : "down"}`}>
      ({d > 0 ? "+" : ""}
      {fmt(Math.round(d * 100) / 100)}
      {unit} vs before)
    </span>
  );
}

/**
 * Results of "Run 1,000 futures" for all domes together: fan chart of species
 * alive, expected species saved, worst case (5th percentile), per-species
 * survival. With `previous` (compare mode) the old run is overlaid faded and
 * the numbers show the change.
 */
export default function RunResults({
  run,
  previous,
  stale,
  nameOf,
}: {
  run: StoredRun;
  previous: StoredRun | null;
  /** Domes changed since this run. */
  stale: boolean;
  nameOf: (id: string) => string;
}) {
  const r = run.result;
  const total = r.per_species.length;
  const prevSurv = new Map(previous?.result.per_species.map((s) => [s.species_id, s.survival_probability]));

  return (
    <section className="run-results" aria-live="polite">
      <header className="run-results-head">
        <h2>1,000 futures: {run.label}</h2>
        {stale && <p className="stale">Domes changed since this run: run again to update.</p>}
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

      <div className="fan-wrap">
        <SpeciesFanChart run={r} previous={previous?.result} speciesTotal={total} />
        <ul className="fan-legend">
          <li><span className="sw band90" /> 90% of futures</li>
          <li><span className="sw band50" /> 50% of futures</li>
          <li><span className="sw median" /> median</li>
          <li><span className="sw p5" /> worst case (5%)</li>
          {previous && (
            <>
              <li><span className="sw prev" /> previous median ({previous.label})</li>
              <li><span className="sw p5prev" /> previous worst case</li>
            </>
          )}
        </ul>
      </div>

      <h3>Survival by species</h3>
      <ul className="species-survival">
        {r.per_species.map((s) => (
          <li key={s.species_id}>
            <Sprite name={`resident-${s.species_id}`} width={16} height={16} frames={2} animate={false} fallback={null} />
            <span className="ss-name">{nameOf(s.species_id)}</span>
            <span className="bar" aria-hidden="true">
              <span className="bar-fill" style={{ width: pct(s.survival_probability) }} />
              {prevSurv.has(s.species_id) && (
                <span className="bar-prev" style={{ left: pct(prevSurv.get(s.species_id)!) }} title="previous run" />
              )}
            </span>
            <span className="ss-pct">{pct(s.survival_probability)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        A species counts as saved if any dome still has it after 50 years. Disasters strike one dome at a time, so
        splitting a species across domes protects it.
      </p>
    </section>
  );
}
