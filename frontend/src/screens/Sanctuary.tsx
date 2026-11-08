import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { advanceSanctuary, checkSimSource, simulateSanctuary } from "../api";
import Sprite from "../components/Sprite";
import Status from "../components/Status";
import { ZorpsPrice } from "../components/ZorpsCounter";
import {
  ADVANCE_YEARS,
  buildRequest,
  capacityOf,
  domeFit,
  isInfected,
  residentTotal,
  runKey,
  runLabel,
  SIM_RUNS,
  SIM_YEARS,
} from "../game/sanctuary";
import { advancePayout, canAfford, domeCost, MAX_DOMES } from "../game/zorps";
import { useEconomy } from "../hooks/useEconomy";
import { useProgress } from "../hooks/useProgress";
import { useReducedMotion } from "../hooks/useReducedMotion";
import AdvanceReport from "../sanctuary/AdvanceReport";
import { CapacityBar, OutbreakBadge } from "../sanctuary/CapacityBar";
import DomeView from "../sanctuary/DomeView";
import ForecastAnimation from "../sanctuary/ForecastAnimation";
import RunResults from "../sanctuary/RunResults";
import { useSanctuarySpecies } from "../sanctuary/useSanctuarySpecies";
import type { DomeState, SanctuarySimResponse, StoredAdvance } from "../types";

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
/** The "simulating" animation always plays at least this long. */
const FORECAST_MIN_MS = 700;
const FORECAST_MIN_MS_REDUCED = 400;
const ADVANCE_RUNS = 500;

const pct = (p: number) => `${Math.round(p * 100)}%`;
const planetBg = { "--planet-bg": `url("${import.meta.env.BASE_URL}sprites/planet-terrain.png")` } as CSSProperties;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Average of this dome's per-species survival in a forecast (null if the dome wasn't in it or was empty). */
function domeSurvival(result: SanctuarySimResponse | undefined, id: string): number | null {
  const d = result?.per_dome.find((x) => x.id === id);
  if (!d || d.survival_by_species.length === 0) return null;
  return d.survival_by_species.reduce((s, x) => s + x.survival_probability, 0) / d.survival_by_species.length;
}

export default function Sanctuary() {
  const { pool, poolExposed, sanctuary, zorps, buildDome, recordRun, applyAdvance, discoveredFor } = useProgress();
  const economy = useEconomy();
  const reduced = useReducedMotion();
  const { domes, lastRun, prevRun } = sanctuary;
  const year = sanctuary.year ?? 0;
  const ids = [...Object.keys(pool), ...domes.flatMap((d) => Object.keys(d.residents))];
  const species = useSanctuarySpecies(ids);
  const [busy, setBusy] = useState<"forecast" | "advance" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState(true);
  const [report, setReport] = useState<StoredAdvance | null>(null);
  // Which model runs Forecast + Advance (shows the "offline sim" badge before the first run).
  useEffect(() => {
    void checkSimSource();
  }, []);

  const poolEntries = Object.entries(pool).filter(([, n]) => n > 0);
  const living = domes.reduce((s, d) => s + residentTotal(d), 0);
  const stale = !!lastRun && lastRun.key !== runKey(domes);
  const nameOf = species.status === "ok" ? species.data.nameOf : (id: string) => id;
  const byId = species.status === "ok" ? species.data.byId : {};
  const cost = domeCost(economy);
  const affordable = canAfford(zorps, cost);
  const builtSpots = domes.map((d) => SITE_POS[d.site]);

  const forecast = async () => {
    setBusy("forecast");
    setError(null);
    try {
      const [result] = await Promise.all([
        simulateSanctuary(buildRequest(domes, SIM_YEARS, SIM_RUNS)),
        // Reduced motion still shows "Simulating…" briefly (no movement), so it doesn't just flash.
        wait(reduced ? FORECAST_MIN_MS_REDUCED : FORECAST_MIN_MS),
      ]);
      recordRun({ key: runKey(domes), label: runLabel(domes), at: Date.now(), result });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const advance = async () => {
    setBusy("advance");
    setError(null);
    try {
      // Current live populations go up as residents[].count; one future comes back.
      const result = await advanceSanctuary(buildRequest(domes, ADVANCE_YEARS, ADVANCE_RUNS));
      const alive: Record<string, number> = {};
      for (const d of result.domes) for (const [id, n] of Object.entries(d.end)) alive[id] = (alive[id] ?? 0) + n;
      // The backend's payout is the source of truth; else its per-survivor rule, computed here.
      const zorpsPaid = result.zorps_earned ?? advancePayout(alive, (id) => byId[id]?.era_year, economy).total;
      const adv: StoredAdvance = {
        at: Date.now(),
        fromYear: year,
        toYear: year + result.years,
        zorps: zorpsPaid,
        domeNames: Object.fromEntries(domes.map((d) => [d.id, d.name])),
        result,
      };
      applyAdvance(adv);
      setReport(adv);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const domeAt = (site: number): DomeState | undefined => domes.find((d) => d.site === site);

  return (
    <section className="sanctuary">
      <header className="sanctuary-head">
        <div>
          <h1>Sanctuary</h1>
          <p className="muted">Sealed glass domes on Glorp's home planet, each with its own climate.</p>
        </div>
        <p className="sanctuary-clock" aria-label={`Sanctuary year plus ${year}`}>
          Year +{year}
        </p>
      </header>

      <div className="planet" style={planetBg}>
        {Array.from({ length: MAX_DOMES }, (_, site) => {
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
                  disabled={!affordable || busy !== null}
                  title={affordable ? undefined : `Needs ${cost} Zorps (you have ${zorps})`}
                  aria-label={`Build a dome here for ${cost} Zorps${affordable ? "" : `: not enough Zorps (you have ${zorps})`}`}
                >
                  Build <ZorpsPrice amount={cost} />
                </button>
              </div>
            );
          }

          const fit = domeFit(dome, byId, discoveredFor);
          const survival = domeSurvival(lastRun?.result, dome.id);
          const residents = Object.entries(dome.residents).filter(([, n]) => n > 0);
          return (
            <Link key={site} to={`/sanctuary/${dome.id}`} className={`dome-site built ${isInfected(dome) ? "infected" : ""}`} style={at}>
              <DomeView conditions={dome} residents={dome.residents} size={DOME_PX} label={`${dome.name}: ${residentTotal(dome)} animals`} />
              <span className="dome-caption">
                <span className="dome-name">{dome.name}</span>
                {isInfected(dome) && <OutbreakBadge yearsLeft={dome.outbreak!.years_left} />}
                <CapacityBar total={residentTotal(dome)} capacity={capacityOf(dome)} compact />
                <span className="dome-counts">
                  {residents.length === 0 ? "empty" : residents.map(([id, n]) => `${n} ${nameOf(id).toLowerCase()}`).join(" · ")}
                </span>
                {fit !== null && (
                  <span className="mini-fit" title="Average fit of residents, from the needs you have discovered">
                    fit <span className="bar small"><span className="bar-fill" style={{ width: pct(fit) }} /></span> {pct(fit)}
                  </span>
                )}
                {survival !== null && (
                  <span className={`dome-last ${stale ? "stale" : ""}`}>
                    forecast: {pct(survival)} kept{stale ? " (old)" : ""}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
        {busy === "forecast" && <ForecastAnimation domeSpots={builtSpots} />}
      </div>

      <div className="sanctuary-cols">
        <section className="pool-panel">
          <h2>Rescued, not yet placed</h2>
          {ids.length === 0 ? (
            <p className="muted">No rescued animals yet. Collect DNA in Explore, then rescue them in the DNA Lab.</p>
          ) : poolEntries.length === 0 ? (
            <p className="muted">Everyone has a dome. Open a dome to move animals back here.</p>
          ) : (
            <ul className="pool-list">
              {poolEntries.map(([id, n]) => (
                <li key={id}>
                  <Sprite name={`resident-${id}`} width={16} height={16} frames={2} animate={false} fallback={null} />
                  <span>{nameOf(id)}</span>
                  <span className="pool-count">{n}</span>
                  {(poolExposed[id] ?? 0) > 0 && (
                    <span className="res-exposed" title="Moved out of a dome with an outbreak: may carry it">
                      {Math.min(n, poolExposed[id])} exposed
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Open a dome to place animals and set its climate.</p>
        </section>

        <section className="run-panel">
          <h2>Time</h2>
          <p className="small">
            <strong>Forecast</strong> shows 1,000 possible futures ({SIM_YEARS} years). <strong>Advance</strong> lives
            through one real future: {ADVANCE_YEARS} years pass, disasters may strike, and thriving species earn Zorps.
          </p>
          <div className="time-buttons">
            <button className="px-button w-m" onClick={forecast} disabled={busy !== null || living === 0}>
              {busy === "forecast" ? "Simulating…" : "Forecast"}
            </button>
            <button className="px-button primary w-l" onClick={advance} disabled={busy !== null || living === 0}>
              {busy === "advance" ? "Living it…" : `Advance ${ADVANCE_YEARS} years`}
            </button>
          </div>
          {living === 0 && <p className="muted small">Place at least one animal in a dome first.</p>}
          {error && <p className="error small">Error: {error}</p>}
          <label className="compare-toggle">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} disabled={!prevRun} />
            Compare with previous forecast{prevRun ? ` (${prevRun.label})` : ""}
          </label>
          {sanctuary.lastAdvance && !report && (
            <button className="px-button" onClick={() => setReport(sanctuary.lastAdvance!)}>
              Last report (year +{sanctuary.lastAdvance.fromYear} → +{sanctuary.lastAdvance.toYear})
            </button>
          )}
        </section>
      </div>

      {species.status !== "ok" && <Status state={species} />}
      {lastRun && <RunResults run={lastRun} previous={compare ? (prevRun ?? null) : null} stale={stale} nameOf={nameOf} />}

      {report && (
        <AdvanceReport
          adv={report}
          domeConditions={Object.fromEntries(domes.map((d) => [d.id, d]))}
          nameOf={nameOf}
          onClose={() => setReport(null)}
        />
      )}
    </section>
  );
}
