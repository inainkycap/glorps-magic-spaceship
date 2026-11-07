import { useId, type CSSProperties } from "react";
import { Link, useParams } from "react-router";
import Sprite from "../components/Sprite";
import Status from "../components/Status";
import { knownFit, type FitVerdict } from "../game/fit";
import { formatNeed, NEED_LABEL } from "../game/needs";
import {
  CONTROLS,
  DISASTERS,
  poolOf,
  residentTotal,
  runKey,
  TERRAIN_LABEL,
  TERRAINS,
  type ControlKey,
} from "../game/sanctuary";
import { useProgress } from "../hooks/useProgress";
import DomeView from "../sanctuary/DomeView";
import { useSanctuarySpecies } from "../sanctuary/useSanctuarySpecies";
import type { DomeState, NeedKey, Species } from "../types";

const DOME_PX = 360;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const planetBg = { "--planet-bg": `url("${import.meta.env.BASE_URL}sprites/planet-terrain.png")` } as CSSProperties;
const VERDICT_TEXT: Record<FitVerdict, string> = { good: "good", close: "close", poor: "off" };

const verdictClass = (fit: number) => (fit >= 0.8 ? "good" : fit >= 0.5 ? "close" : "poor");

/**
 * One resident species' fit to this dome, AS THE PLAYER KNOWS IT: the bar has a
 * segment per need; discovered needs are scored, undiscovered ones are a grey
 * "?" segment that gives no hint. The % uses discovered needs only. (The sim
 * still uses the real needs; see game/fit.ts.)
 */
function ResidentFit({ species, dome, discovered }: { species: Species; dome: DomeState; discovered: NeedKey[] }) {
  const { fit, segments } = knownFit(species, dome, discovered);
  const knownCount = segments.filter((s) => s.fit !== null).length;
  return (
    <div className="resident-fit">
      <div className="rf-head">
        <span>{species.name}</span>
        <span
          className="seg-bar"
          role="meter"
          aria-label={`${species.name} fit from ${knownCount} of ${segments.length} known needs`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fit === null ? undefined : Math.round(fit * 100)}
          aria-valuetext={fit === null ? "unknown: no needs discovered" : pct(fit)}
        >
          {segments.map((s) =>
            s.fit === null ? (
              <span key={s.key} className="seg unknown" title={`${NEED_LABEL[s.key]}: not discovered`}>
                ?
              </span>
            ) : (
              <span key={s.key} className="seg" title={`${NEED_LABEL[s.key]}: ${pct(s.fit)}`}>
                <span className={`seg-fill ${verdictClass(s.fit)}`} style={{ height: pct(s.fit) }} />
              </span>
            ),
          )}
        </span>
        <span className="rf-pct">{fit === null ? "?" : pct(fit)}</span>
      </div>
      <p className="rf-basis">
        {knownCount === 0
          ? "No needs discovered yet: scan hotspots in its world to learn them."
          : `From ${knownCount} of ${segments.length} known needs`}
      </p>
      <ul className="rf-needs">
        {segments.map((s) => (
          <li key={s.key} className={s.fit === null ? "unknown" : "known"}>
            <span className="rf-label">{NEED_LABEL[s.key]}</span>
            <span className="rf-ideal">{s.fit === null ? "???" : (formatNeed(species.needs![s.key]!) ?? "?")}</span>
            {/* Undiscovered needs give no hint at all, not even whether the dome matches. */}
            {s.verdict && <span className={`rf-verdict ${s.verdict}`}>{VERDICT_TEXT[s.verdict]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SanctuaryDome() {
  const { domeId = "" } = useParams();
  const { rescued, sanctuary, updateDome, moveResidents, discoveredFor } = useProgress();
  const dome = sanctuary.domes.find((d) => d.id === domeId);
  const ids = [...Object.keys(rescued), ...(dome ? Object.keys(dome.residents) : [])];
  const species = useSanctuarySpecies(ids);
  const nameInputId = useId();

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

  const pool = poolOf(rescued, sanctuary.domes);
  const rescuedIds = Object.keys(rescued).filter((id) => (rescued[id] ?? 0) > 0);
  const nameOf = species.status === "ok" ? species.data.nameOf : (id: string) => id;
  const lastRun = sanctuary.lastRun;
  const domeResult = lastRun?.result.per_dome.find((d) => d.id === dome.id);
  const stale = !!lastRun && lastRun.key !== runKey(sanctuary.domes);
  const setControl = (key: ControlKey, value: number) => updateDome(dome.id, { [key]: value });

  return (
    <section className="dome-detail">
      <Link className="px-button w-m" to="/sanctuary">
        Back to Sanctuary
      </Link>

      <div className="dome-detail-grid">
        <div className="dome-stage planet" style={planetBg}>
          <DomeView
            conditions={dome}
            residents={dome.residents}
            size={DOME_PX}
            label={`${dome.name}: ${TERRAIN_LABEL[dome.terrain]}, ${dome.temperature} °C, ${residentTotal(dome)} residents`}
          />
        </div>

        <aside className="control-panel" aria-label="Glorp's control panel">
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

          <h2 className="cp-heading">Residents</h2>
          {rescuedIds.length === 0 ? (
            <p className="muted small">Nobody rescued yet. Rescue individuals in the DNA Lab first.</p>
          ) : (
            <ul className="placement">
              {rescuedIds.map((id) => {
                const here = dome.residents[id] ?? 0;
                const free = pool[id] ?? 0;
                return (
                  <li key={id}>
                    <Sprite name={`resident-${id}`} width={16} height={16} frames={2} animate={false} fallback={null} />
                    <span className="pl-name">{nameOf(id)}</span>
                    <span className="stepper" role="group" aria-label={`${nameOf(id)} in this dome`}>
                      <button className="px-button icon step" onClick={() => moveResidents(dome.id, id, -1)} disabled={here === 0} aria-label={`Move one ${nameOf(id)} back to the pool`}>
                        −
                      </button>
                      <span className="step-count" aria-live="polite">{here}</span>
                      <button className="px-button icon step" onClick={() => moveResidents(dome.id, id, 1)} disabled={free === 0} aria-label={`Move one ${nameOf(id)} into this dome`}>
                        +
                      </button>
                    </span>
                    <span className="pl-pool">pool {free}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="cp-heading">Fit to this dome</h2>
          {species.status !== "ok" ? (
            <Status state={species} />
          ) : Object.keys(dome.residents).length === 0 ? (
            <p className="muted small">Place residents to see how well this dome suits them.</p>
          ) : (
            Object.keys(dome.residents).map((id) =>
              species.data.byId[id] ? (
                <ResidentFit key={id} species={species.data.byId[id]} dome={dome} discovered={discoveredFor(id)} />
              ) : null,
            )
          )}

          <h2 className="cp-heading">Last run{stale ? " (out of date)" : ""}</h2>
          {domeResult && domeResult.survival_by_species.length > 0 ? (
            <ul className="dome-results">
              {domeResult.survival_by_species.map((s) => (
                <li key={s.species_id}>
                  {nameOf(s.species_id)}: {pct(s.survival_probability)} still here after 50 years
                </li>
              ))}
              <li>Hit by at least one disaster in {pct(domeResult.disaster_rate)} of futures</li>
            </ul>
          ) : (
            <p className="muted small">Run 1,000 futures from the Sanctuary overview.</p>
          )}

          <h2 className="cp-heading">Dome disasters</h2>
          <ul className="disasters">
            {DISASTERS.map((d) => (
              <li key={d.id}>
                <Sprite name={`disaster-${d.id}`} width={16} height={16} fallback={<span className="disaster-fallback" />} />
                <span>
                  <strong>{d.label}</strong>: {d.text}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">They hit everyone inside one dome at once. Other domes are safe.</p>
        </aside>
      </div>
    </section>
  );
}
