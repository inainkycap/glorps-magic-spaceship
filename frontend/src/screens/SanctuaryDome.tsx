import { useId, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router";
import Sprite from "../components/Sprite";
import Status from "../components/Status";
import { ZorpsPrice } from "../components/ZorpsCounter";
import { knownFit, type FitVerdict } from "../game/fit";
import { formatNeed, NEED_LABEL } from "../game/needs";
import {
  animals,
  CAPACITY_STEP,
  capacityOf,
  CONTROLS,
  DEFAULT_DOME_CAPACITY,
  DISASTERS,
  isInfected,
  MAX_DOME_CAPACITY,
  outbreakStatus,
  residentTotal,
  roomIn,
  runKey,
  TERRAIN_LABEL,
  TERRAINS,
  type ControlKey,
} from "../game/sanctuary";
import { canAfford, capacityUpgradeCost } from "../game/zorps";
import { useProgress } from "../hooks/useProgress";
import { CapacityBar, OutbreakBadge } from "../sanctuary/CapacityBar";
import DisastersHelp from "../sanctuary/DisastersHelp";
import DomeView from "../sanctuary/DomeView";
import { useSanctuarySpecies } from "../sanctuary/useSanctuarySpecies";
import type { DomeState, NeedKey, Species } from "../types";

const DOME_PX = 320;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const planetBg = { "--planet-bg": `url("${import.meta.env.BASE_URL}sprites/planet-terrain.png")` } as CSSProperties;
const VERDICT_TEXT: Record<FitVerdict, string> = { good: "good", close: "close", poor: "off" };
const verdictClass = (fit: number) => (fit >= 0.8 ? "good" : fit >= 0.5 ? "close" : "poor");

/**
 * One species row in the residents column: sprite, name, stepper, pool count and
 * fit % (from discovered needs only). Expands to a per-need breakdown with the
 * "why"; undiscovered needs show "???" and give no hint.
 */
function ResidentRow({
  id,
  species,
  name,
  dome,
  here,
  free,
  room,
  exposed,
  discovered,
  onMove,
}: {
  id: string;
  species: Species | undefined;
  name: string;
  dome: DomeState;
  here: number;
  free: number;
  room: number;
  exposed: number;
  discovered: NeedKey[];
  onMove: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const known = species ? knownFit(species, dome, discovered) : null;
  const fit = known?.fit ?? null;
  const full = room === 0 && free > 0;

  return (
    <li className={`res-row ${open ? "open" : ""}`}>
      <div className="res-head">
        <button className="res-toggle" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((o) => !o)} aria-label={`${name}: fit details`}>
          <span className="res-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <Sprite name={`resident-${id}`} width={16} height={16} frames={2} animate={false} fallback={null} />
          <span className="res-name">{name}</span>
        </button>
        <span className="stepper" role="group" aria-label={`${name} in this dome`}>
          <button className="px-button icon step" onClick={() => onMove(-1)} disabled={here === 0} aria-label={`Move one ${name} back to the pool`}>
            −
          </button>
          <span className="step-count" aria-live="polite">{here}</span>
          <button
            className="px-button icon step"
            onClick={() => onMove(1)}
            disabled={free === 0 || room === 0}
            title={full ? "This dome is full: upgrade its capacity or use another dome" : undefined}
            aria-label={full ? `Move one ${name} into this dome: the dome is full` : `Move one ${name} into this dome`}
          >
            +
          </button>
        </span>
        <span className="res-meta">
          <span className="res-pool">pool {free}</span>
          {exposed > 0 && (
            <span className="res-exposed" title="Came from a dome with an outbreak: may bring it here">
              {exposed} exposed
            </span>
          )}
          {here > 0 && (
            <span className={`res-fit ${fit === null ? "" : verdictClass(fit)}`} title="Fit from the needs you've discovered">
              fit {fit === null ? "?" : pct(fit)}
            </span>
          )}
        </span>
      </div>
      {open && known && species && (
        <div id={detailsId} className="res-details">
          <span className="seg-bar" aria-hidden="true">
            {known.segments.map((s) =>
              s.fit === null ? (
                <span key={s.key} className="seg unknown">?</span>
              ) : (
                <span key={s.key} className="seg">
                  <span className={`seg-fill ${verdictClass(s.fit)}`} style={{ height: pct(s.fit) }} />
                </span>
              ),
            )}
          </span>
          <ul className="rf-needs">
            {known.segments.map((s) => (
              <li key={s.key} className={s.fit === null ? "unknown" : "known"}>
                <span className="rf-label">{NEED_LABEL[s.key]}</span>
                <span className="rf-ideal">{s.fit === null ? "???" : (formatNeed(species.needs![s.key]!) ?? "?")}</span>
                {s.verdict && <span className={`rf-verdict ${s.verdict}`}>{VERDICT_TEXT[s.verdict]}</span>}
                {s.fit !== null && species.needs?.[s.key]?.why && <span className="rf-why">{species.needs[s.key]!.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/**
 * One dome, laid out to fit a 1280×720 screen without page scroll:
 * residents + capacity (left) · the dome + last forecast / last advance (centre) ·
 * Glorp's controls (right). Disasters are behind a "?" button.
 */
export default function SanctuaryDome() {
  const { domeId = "" } = useParams();
  const { pool, poolExposed, sanctuary, zorps, updateDome, moveResidents, upgradeCapacity, discoveredFor } = useProgress();
  const dome = sanctuary.domes.find((d) => d.id === domeId);
  const ids = [...new Set([...Object.keys(pool), ...(dome ? Object.keys(dome.residents) : [])])];
  const species = useSanctuarySpecies(ids);
  const nameInputId = useId();
  const [movedOut, setMovedOut] = useState(0);

  if (!dome) {
    return (
      <section>
        <h1>No such dome</h1>
        <Link className="px-button w-m" to="/sanctuary">
          Back to Sanctuary
        </Link>
      </section>
    );
  }

  const nameOf = species.status === "ok" ? species.data.nameOf : (id: string) => id;
  const listed = ids.filter((id) => (pool[id] ?? 0) > 0 || (dome.residents[id] ?? 0) > 0);
  const lastRun = sanctuary.lastRun;
  const forecastHere = lastRun?.result.per_dome.find((d) => d.id === dome.id);
  const stale = !!lastRun && lastRun.key !== runKey(sanctuary.domes);
  const adv = sanctuary.lastAdvance;
  const advHere = adv?.result.domes.find((d) => d.id === dome.id);
  const setControl = (key: ControlKey, value: number) => updateDome(dome.id, { [key]: value });

  const total = residentTotal(dome);
  const capacity = capacityOf(dome);
  const room = roomIn(dome);
  const infected = isInfected(dome);
  const exposedHere = Object.values(dome.exposed ?? {}).reduce((a, b) => a + b, 0);
  const maxed = capacity >= MAX_DOME_CAPACITY;
  const upgradeCost = capacityUpgradeCost(capacity, DEFAULT_DOME_CAPACITY, CAPACITY_STEP);
  const canUpgrade = !maxed && canAfford(zorps, upgradeCost);
  const move = (id: string, delta: number) => {
    const moved = moveResidents(dome.id, id, delta);
    if (moved < 0 && infected) setMovedOut((n) => n - moved);
  };
  const advOutbreak = advHere ? outbreakStatus(advHere.events.some((e) => e.type === "disease"), advHere.outbreak) : null;

  return (
    <section className="dome-page">
      <header className="dome-page-head">
        <Link className="px-button" to="/sanctuary">
          Back to Sanctuary
        </Link>
        <h1>{dome.name}</h1>
        <span className="muted small">
          {total} animals · Year +{sanctuary.year ?? 0}
        </span>
      </header>

      <div className="dome-cols">
        {/* LEFT: capacity + residents */}
        <aside className="dome-col residents-col" aria-label="Residents">
          <h2 className="cp-heading">Residents</h2>
          <div className="capacity-row">
            <span className="cp-label">Capacity</span>
            <CapacityBar total={total} capacity={capacity} />
          </div>
          <button
            className="px-button upgrade-btn"
            onClick={() => upgradeCapacity(dome.id)}
            disabled={!canUpgrade}
            title={maxed ? `Already at the maximum (${MAX_DOME_CAPACITY})` : canUpgrade ? undefined : `Needs ${upgradeCost} Zorps (you have ${zorps})`}
          >
            {maxed ? "Capacity maxed" : <>Upgrade capacity (+{CAPACITY_STEP}) <ZorpsPrice amount={upgradeCost} /></>}
          </button>
          {infected && (
            <p className="outbreak-warning" role="alert">
              Outbreak in this dome ({dome.outbreak!.years_left} year{dome.outbreak!.years_left === 1 ? "" : "s"} left).
              Animals you move out may carry it to other domes{movedOut > 0 ? `: ${movedOut} moved out so far` : ""}.
            </p>
          )}
          {!infected && exposedHere > 0 && (
            <p className="outbreak-warning mild">
              {exposedHere} animal{exposedHere === 1 ? "" : "s"} here came from an infected dome and may bring the outbreak.
            </p>
          )}
          {listed.length === 0 ? (
            <p className="muted small">Nobody to place yet. Rescue animals in the DNA Lab first.</p>
          ) : (
            <ul className="res-list">
              {listed.map((id) => (
                <ResidentRow
                  key={id}
                  id={id}
                  species={species.status === "ok" ? species.data.byId[id] : undefined}
                  name={nameOf(id)}
                  dome={dome}
                  here={dome.residents[id] ?? 0}
                  free={pool[id] ?? 0}
                  room={room}
                  exposed={infected ? 0 : Math.min(dome.residents[id] ?? 0, dome.exposed?.[id] ?? 0) + Math.min(pool[id] ?? 0, poolExposed[id] ?? 0)}
                  discovered={discoveredFor(id)}
                  onMove={(delta) => move(id, delta)}
                />
              ))}
            </ul>
          )}
          {species.status !== "ok" && <Status state={species} />}
        </aside>

        {/* CENTRE: the dome + compact summaries */}
        <div className="dome-col centre-col">
          <div className={`dome-stage planet ${infected ? "infected" : ""}`} style={planetBg}>
            <DomeView
              conditions={dome}
              residents={dome.residents}
              size={DOME_PX}
              label={`${dome.name}: ${TERRAIN_LABEL[dome.terrain]}, ${dome.temperature} °C, ${total} animals${infected ? ", disease outbreak" : ""}`}
            />
            {infected && (
              <span className="stage-badge">
                <OutbreakBadge yearsLeft={dome.outbreak!.years_left} />
              </span>
            )}
          </div>
          <div className="dome-summaries">
            <div className="summary">
              <h3>Last forecast{stale ? " (out of date)" : ""}</h3>
              {forecastHere && forecastHere.survival_by_species.length > 0 ? (
                <p className="small">
                  {forecastHere.survival_by_species.map((s) => `${nameOf(s.species_id)} ${pct(s.survival_probability)}`).join(" · ")}
                  <br />
                  <span className="muted">disaster in {pct(forecastHere.disaster_rate)} of futures</span>
                </p>
              ) : (
                <p className="muted small">Forecast from the Sanctuary overview.</p>
              )}
            </div>
            <div className="summary">
              <h3>Last advance{adv ? ` (+${adv.fromYear} → +${adv.toYear})` : ""}</h3>
              {advHere ? (
                <p className="small">
                  {Object.keys({ ...advHere.start, ...advHere.end })
                    .map((id) => `${nameOf(id)} ${advHere.start[id] ?? 0}→${advHere.end[id] ?? 0}`)
                    .join(" · ")}
                  <br />
                  <span className="muted">
                    {advHere.events.length === 0
                      ? "no disasters"
                      : advHere.events
                          .map((e) => `${DISASTERS.find((d) => d.id === e.type)?.label ?? e.type} (year +${adv!.fromYear + e.year}): ${Object.entries(e.lost).map(([id, n]) => animals(n, nameOf(id))).join(", ") || "none"} lost`)
                          .join("; ")}
                    {advOutbreak ? ` · ${advOutbreak}` : ""}
                  </span>
                </p>
              ) : (
                <p className="muted small">Advance time from the Sanctuary overview.</p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Glorp's controls */}
        <aside className="dome-col control-panel" aria-label="Glorp's control panel">
          <div className="cp-row">
            <label htmlFor={nameInputId} className="cp-label">
              Name
            </label>
            <input
              id={nameInputId}
              className="cp-name"
              value={dome.name}
              maxLength={20}
              onChange={(e) => updateDome(dome.id, { name: e.target.value })}
              onBlur={(e) => {
                if (!e.target.value.trim()) updateDome(dome.id, { name: "Unnamed dome" });
              }}
            />
          </div>
          <fieldset className="cp-terrain">
            <legend className="cp-label">Terrain</legend>
            {TERRAINS.map((t) => (
              <button
                key={t}
                className={`px-button cp-terrain-btn ${dome.terrain === t ? "selected" : ""}`}
                aria-pressed={dome.terrain === t}
                onClick={() => updateDome(dome.id, { terrain: t })}
              >
                {TERRAIN_LABEL[t]}
              </button>
            ))}
          </fieldset>
          {(Object.keys(CONTROLS) as ControlKey[]).map((key) => {
            const c = CONTROLS[key];
            const inputId = `${nameInputId}-${key}`;
            return (
              <div key={key} className="cp-dial">
                <label htmlFor={inputId} className="cp-label">
                  {c.label}
                </label>
                <input
                  id={inputId}
                  type="range"
                  className="dial"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={dome[key]}
                  onChange={(e) => setControl(key, Number(e.target.value))}
                />
                <output htmlFor={inputId} className="cp-value">
                  {dome[key]} {c.unit}
                </output>
              </div>
            );
          })}
          <DisastersHelp />
        </aside>
      </div>
    </section>
  );
}
