import { useEffect, useRef } from "react";
import { aliveInDomes, diversityScore, isComplete, overallCompletion, pctText } from "../game/encyclopedia";
import { useProgress } from "../hooks/useProgress";
import { useSpeciesData } from "../hooks/useSpeciesData";
import GlorpSprite from "./GlorpSprite";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The goal: once every species is rescued and thriving, a one-time end screen with
 * the final diversity score, completion, sanctuary year and species saved.
 * "Keep playing" closes it for good (progress.endSeen).
 */
export default function GameComplete() {
  const data = useSpeciesData();
  const { progress, sanctuary, markEndSeen } = useProgress();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const show = data.status === "ok" && !progress.endSeen && isComplete(data.data.list, progress);

  useEffect(() => {
    if (!show) return;
    buttonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && markEndSeen();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, markEndSeen]);

  if (!show || data.status !== "ok") return null;
  const { list, byId } = data.data;
  const score = diversityScore(sanctuary, Object.fromEntries(list.map((s) => [s.id, s])));
  const completion = overallCompletion(list.map((s) => byId[s.id]).filter(Boolean), progress);
  const saved = Object.keys(aliveInDomes(sanctuary)).length;

  return (
    <div className="report-backdrop end-backdrop">
      <div className="end-screen" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <GlorpSprite size={96} variant="talk" />
        <h2 id="end-title">Every species is home!</h2>
        <p className="end-lead">
          You rescued all {list.length} species and every one of them is thriving in Glorp's sanctuary.
        </p>
        <dl className="end-stats">
          <div>
            <dt>Diversity score</dt>
            <dd>{fmt(score)}</dd>
          </div>
          <div>
            <dt>Encyclopedia</dt>
            <dd>{pctText(completion)}</dd>
          </div>
          <div>
            <dt>Sanctuary year</dt>
            <dd>+{sanctuary.year ?? 0}</dd>
          </div>
          <div>
            <dt>Species saved</dt>
            <dd>
              {saved} / {list.length}
            </dd>
          </div>
        </dl>
        <p className="small muted">Keep the domes thriving to raise your diversity score, and finish every encyclopedia page.</p>
        <button ref={buttonRef} className="px-button primary" onClick={markEndSeen}>
          Keep playing
        </button>
      </div>
    </div>
  );
}
