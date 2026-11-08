import { useEffect, useEffectEvent, useRef, useState } from "react";
import Sprite from "../components/Sprite";
import { ZorpsPrice } from "../components/ZorpsCounter";
import { animals, DISASTERS, luckLine, outbreakStatus } from "../game/sanctuary";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { AdvanceDome, DisasterType, StoredAdvance } from "../types";
import DomeView from "./DomeView";

const YEAR_MS = 320;
const disasterLabel = (t: DisasterType) => DISASTERS.find((d) => d.id === t)?.label ?? t;

/**
 * A dome's animals partway through the recap: start, minus losses so far; the
 * real end at the end. (An outbreak's toll is reported for the whole advance, so
 * it shows from the year it struck.)
 */
function populationAt(d: AdvanceDome, year: number, years: number): Record<string, number> {
  if (year >= years) return d.end;
  const out = { ...d.start };
  for (const e of d.events) if (e.year <= year) for (const [id, n] of Object.entries(e.lost)) out[id] = Math.max(0, (out[id] ?? 0) - n);
  return out;
}

/**
 * The report after "Advance 10 years": an animated recap (years tick, disaster
 * icons pop on the domes they hit, residents disappear or appear), then a card
 * per dome, the Zorps earned and how lucky this future was. Reduced motion:
 * straight to the cards.
 */
export default function AdvanceReport({
  adv,
  domeConditions,
  nameOf,
  onClose,
}: {
  adv: StoredAdvance;
  domeConditions: Record<string, Parameters<typeof DomeView>[0]["conditions"]>;
  nameOf: (id: string) => string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const years = adv.result.years;
  const [year, setYear] = useState(reduced ? years : 0);
  const [phase, setPhase] = useState<"recap" | "report">(reduced ? "report" : "recap");
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (phase !== "recap") return;
    const id = setInterval(() => setYear((y) => Math.min(years, y + 1)), YEAR_MS);
    return () => clearInterval(id);
  }, [phase, years]);
  useEffect(() => {
    if (phase === "recap" && year >= years) {
      const id = setTimeout(() => setPhase("report"), 600);
      return () => clearTimeout(id);
    }
  }, [phase, year, years]);
  useEffect(() => {
    if (phase === "report") closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const name = (id: string) => adv.domeNames[id] ?? id;
  const clock = (y: number) => `Year +${adv.fromYear + y}`;

  return (
    <div className="report-backdrop">
      <div className="advance-report" role="dialog" aria-modal="true" aria-label={`Report: ${clock(0)} to ${clock(years)}`}>
        <header className="report-head">
          <h2>
            {clock(0)} → {clock(years)}
          </h2>
          {phase === "recap" && (
            <button className="px-button" onClick={() => setPhase("report")}>
              Skip
            </button>
          )}
        </header>

        {phase === "recap" ? (
          <div className="recap" aria-live="polite">
            <p className="recap-year">{clock(year)}</p>
            <div className="recap-domes">
              {adv.result.domes.map((d) => {
                const now = populationAt(d, year, years);
                const hits = d.events.filter((e) => e.year === year);
                const cond = domeConditions[d.id];
                return (
                  <div key={d.id} className="recap-dome">
                    {cond && <DomeView conditions={cond} residents={now} size={112} label={name(d.id)} />}
                    {hits.map((e, i) => (
                      <span key={i} className="recap-hit" title={disasterLabel(e.type)}>
                        <Sprite name={`disaster-${e.type}`} width={16} height={16} fallback={<span className="disaster-fallback" />} />
                      </span>
                    ))}
                    <span className="recap-name">{name(d.id)}</span>
                    <span className="recap-count">{Object.values(now).reduce((a, b) => a + b, 0)} animals</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="report-body">
            <div className="report-cards">
              {adv.result.domes.map((d) => {
                const ids = [...new Set([...Object.keys(d.start), ...Object.keys(d.end)])];
                const outbreak = outbreakStatus(d.events.some((e) => e.type === "disease"), d.outbreak);
                return (
                  <article key={d.id} className="report-card">
                    <h3>{name(d.id)}</h3>
                    <ul className="report-pop">
                      {ids.map((id) => {
                        const a = d.start[id] ?? 0;
                        const b = d.end[id] ?? 0;
                        return (
                          <li key={id} className={b > a ? "up" : b < a ? "down" : ""}>
                            {nameOf(id)}: {a} → {b}
                            {b === 0 && a > 0 ? " (gone from this dome)" : ""}
                          </li>
                        );
                      })}
                    </ul>
                    {d.events.length === 0 ? (
                      <p className="report-quiet">A quiet decade: no disasters.</p>
                    ) : (
                      <ul className="report-events">
                        {d.events.map((e, i) => {
                          const lost = Object.entries(e.lost).filter(([, n]) => n > 0);
                          const what = e.ongoing
                            ? `The outbreak on ${name(d.id)} carried on`
                            : e.spread
                              ? `${disasterLabel(e.type)} on ${name(d.id)} in year +${adv.fromYear + e.year}, brought in by moved animals`
                              : `${disasterLabel(e.type)} on ${name(d.id)} in year +${adv.fromYear + e.year}`;
                          return (
                            <li key={i}>
                              <Sprite name={`disaster-${e.type}`} width={16} height={16} scale={1} fallback={<span className="disaster-fallback small" />} />
                              <span>
                                {what}:{" "}
                                {lost.length === 0 ? "no animals lost" : `${lost.map(([id, n]) => animals(n, nameOf(id))).join(", ")} lost`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {outbreak && <p className={`report-outbreak ${d.outbreak ? "active" : "ended"}`}>{outbreak}</p>}
                  </article>
                );
              })}
            </div>
            <p className="report-zorps">
              {adv.zorps > 0 ? (
                <>
                  Thriving species earned <ZorpsPrice amount={adv.zorps} />
                </>
              ) : (
                "No species thrived enough to earn Zorps this time."
              )}
            </p>
            <p className="report-luck">{luckLine(adv.result.luck_percentile)}</p>
            <p className="small muted">
              {adv.result.species_alive_end} species still alive in your sanctuary.
            </p>
            <button ref={closeRef} className="px-button primary" onClick={onClose}>
              Back to the Sanctuary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
