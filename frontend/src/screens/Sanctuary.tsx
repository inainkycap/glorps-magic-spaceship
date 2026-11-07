import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { simulateSanctuary } from "../api";
import Sprite from "../components/Sprite";
import Status from "../components/Status";
import { canAfford, DOME_SITES, FUEL_COSTS } from "../game/fuel";
import { buildRequest, domeFit, poolOf, residentTotal, runKey, runLabel } from "../game/sanctuary";
import { useProgress } from "../hooks/useProgress";
import DomeView from "../sanctuary/DomeView";
import RunResults from "../sanctuary/RunResults";
import { useSanctuarySpecies } from "../sanctuary/useSanctuarySpecies";
import type { DomeState, SanctuarySimResponse } from "../types";

/** Where the 6 dome sites sit on the planet panel (% of its width/height). */
const SITE_POS = [
  { x: 18, y: 32 },
  { x: 50, y: 28 },
  { x: 82, y: 32 },
  { x: 18, y: 74 },
  { x: 50, y: 70 },
  { x: 82, y: 74 },
];
const DOME_PX = 132;

const pct = (p: number) => `${Math.round(p * 100)}%`;
const planetBg = { "--planet-bg": `url("${import.meta.env.BASE_URL}sprites/planet-terrain.png")` } as CSSProperties;

/** Average of this dome's per-species survival in a run (null if the dome wasn't in it or was empty). */
function domeSurvival(result: SanctuarySimResponse | undefined, id: string): number | null {
  const d = result?.per_dome.find((x) => x.id === id);
  if (!d || d.survival_by_species.length === 0) return null;
  return d.survival_by_species.reduce((s, x) => s + x.survival_probability, 0) / d.survival_by_species.length;
}

export default function Sanctuary() {
  const { rescued, sanctuary, fuel, buildDome, recordRun, discoveredFor } = useProgress();
  const { domes, lastRun, prevRun } = sanctuary;
  const ids = [...Object.keys(rescued), ...domes.flatMap((d) => Object.keys(d.residents))];
  const species = useSanctuarySpecies(ids);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [compare, setCompare] = useState(true);

  const pool = poolOf(rescued, domes);
  const poolEntries = Object.entries(pool).filter(([, n]) => n > 0);
  const placed = domes.reduce((s, d) => s + residentTotal(d), 0);
  const stale = !!lastRun && lastRun.key !== runKey(domes);
  const nameOf = species.status === "ok" ? species.data.nameOf : (id: string) => id;
  const byId = species.status === "ok" ? species.data.byId : {};
  const cost = FUEL_COSTS.buildDome;
  const affordable = canAfford(fuel, cost);

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const result = await simulateSanctuary(buildRequest(domes));
      recordRun({ key: runKey(domes), label: runLabel(domes), at: Date.now(), result });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const domeAt = (site: number): DomeState | undefined => domes.find((d) => d.site === site);

  return (
    <section className="sanctuary">
      <header className="sanctuary-head">
        <h1>Sanctuary</h1>
        <p className="muted">Sealed glass domes on Glorp's home planet, each with its own climate.</p>
      </header>

      <div className="planet" style={planetBg}>
        {Array.from({ length: DOME_SITES }, (_, site) => {
          const pos = SITE_POS[site];
          const dome = domeAt(site);
          const at = { left: `${pos.x}%`, top: `${pos.y}%` };

          if (!dome) {
            return (
              <div key={site} className="dome-site empty" style={at}>
                <Sprite name="dome-site" width={32} height={32} fallback={<span className="dome-site-fallback" />} />
                <button
                  className="px-button w-s"
                  onClick={() => buildDome(site)}
                  disabled={!affordable}
                  title={affordable ? undefined : `Needs ${cost} fuel (you have ${fuel})`}
                  aria-label={`Build a dome here for ${cost} fuel${affordable ? "" : `: not enough fuel (you have ${fuel})`}`}
                >
                  Build ⛽{cost}
                </button>
              </div>
            );
          }

          const fit = domeFit(dome, byId, discoveredFor);
          const survival = domeSurvival(lastRun?.result, dome.id);
          const residents = Object.entries(dome.residents).filter(([, n]) => n > 0);
          return (
            <Link key={site} to={`/sanctuary/${dome.id}`} className="dome-site built" style={at}>
              <DomeView
                conditions={dome}
                residents={dome.residents}
                size={DOME_PX}
                label={`${dome.name}: ${residentTotal(dome)} residents`}
              />
              <span className="dome-caption">
                <span className="dome-name">{dome.name}</span>
                <span className="dome-counts">
                  {residents.length === 0
                    ? "empty"
                    : residents.map(([id, n]) => `${n} ${nameOf(id).toLowerCase()}`).join(" · ")}
                </span>
                {fit !== null && (
                  <span className="mini-fit" title="Average fit of residents, from the needs you have discovered">
                    fit <span className="bar small"><span className="bar-fill" style={{ width: pct(fit) }} /></span> {pct(fit)}
                  </span>
                )}
                {survival !== null && (
                  <span className={`dome-last ${stale ? "stale" : ""}`}>
                    last run: {pct(survival)} kept{stale ? " (old)" : ""}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="sanctuary-cols">
        <section className="pool-panel">
          <h2>Rescued, not yet placed</h2>
          {Object.keys(rescued).length === 0 ? (
            <p className="muted">
              No rescued individuals yet. Collect DNA in Explore, then rescue them in the DNA Lab.
            </p>
          ) : poolEntries.length === 0 ? (
            <p className="muted">Everyone has a dome. Open a dome to move individuals back here.</p>
          ) : (
            <ul className="pool-list">
              {poolEntries.map(([id, n]) => (
                <li key={id}>
                  <Sprite name={`resident-${id}`} width={16} height={16} frames={2} animate={false} fallback={null} />
                  <span>{nameOf(id)}</span>
                  <span className="pool-count">{n}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Open a dome to place individuals and set its climate.</p>
        </section>

        <section className="run-panel">
          <h2>Run 1,000 futures</h2>
          <p className="small">Simulates all domes together for 50 years, with per-dome disasters.</p>
          <button className="px-button primary w-l" onClick={run} disabled={running || placed === 0}>
            {running ? "Simulating…" : "Run 1,000 futures"}
          </button>
          {placed === 0 && <p className="muted small">Place at least one individual in a dome first.</p>}
          {runError && <p className="error small">Error: {runError}</p>}
          <label className="compare-toggle">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} disabled={!prevRun} />
            Compare with previous run{prevRun ? ` (${prevRun.label})` : ""}
          </label>
        </section>
      </div>

      {species.status !== "ok" && <Status state={species} />}
      {lastRun && (
        <RunResults run={lastRun} previous={compare ? (prevRun ?? null) : null} stale={stale} nameOf={nameOf} />
      )}
    </section>
  );
}
