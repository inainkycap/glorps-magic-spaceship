import { useEffect } from "react";
import { Link } from "react-router";
import DiversityCounter from "../components/DiversityCounter";
import DiversityIcon from "../components/DiversityIcon";
import SpeciesPortrait from "../components/SpeciesPortrait";
import Sprite from "../components/Sprite";
import Status from "../components/Status";
import {
  completionOf,
  diversityValueOf,
  isFound,
  isRevealed,
  isUnlocked,
  newlyUnlocked,
  overallCompletion,
  pctText,
  UNLOCK_AFTER_RESCUES,
} from "../game/encyclopedia";
import { useProgress } from "../hooks/useProgress";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useSpeciesData } from "../hooks/useSpeciesData";

/** How long the "light up" reveal plays before it's marked as seen. */
const REVEAL_MS = 2600;

const DIVERSITY_TIP = "How evolutionarily unique this species is (1–5)";

/**
 * Every species as a card. Locked: a black silhouette marked "locked". Unlocked
 * but not found yet: a glowing silhouette and "???". Found on the map (or
 * visited): the sprite, its name and completion; it opens its page.
 */
export default function Encyclopedia() {
  const data = useSpeciesData();
  const { progress, unlock, markRevealSeen } = useProgress();
  const reduced = useReducedMotion();
  const ok = data.status === "ok" ? data.data : null;

  // Species unlocked since the last visit light up once.
  const newIds = ok && unlock.seenGuide < unlock.wave ? newlyUnlocked(ok.waves, unlock.seenGuide, unlock.wave) : [];
  const revealKey = newIds.join(",");
  useEffect(() => {
    if (!revealKey) return;
    const t = setTimeout(() => markRevealSeen("guide", unlock.wave), reduced ? 0 : REVEAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  if (!ok) return <Status state={data.status === "error" ? data : { status: "loading" }} />;

  const ordered = [...ok.list].sort((a, b) => ok.waves[a.id] - ok.waves[b.id] || b.era_year - a.era_year || a.id.localeCompare(b.id));
  const full = ordered.map((s) => ok.byId[s.id]).filter(Boolean);
  const overall = overallCompletion(full, progress);
  const discovered = ordered.filter((s) => isRevealed(s.id, progress)).length;
  const nextAt = UNLOCK_AFTER_RESCUES[unlock.wave]; // rescues needed for the next wave (undefined: all unlocked)
  const toGo = nextAt === undefined ? 0 : Math.max(0, nextAt - progress.saved.length);

  return (
    <section className="encyclopedia">
      <header className="ency-head">
        <div>
          <h1>Encyclopedia</h1>
          <p className="muted small">
            {discovered} of {ordered.length} species discovered.{" "}
            {toGo > 0
              ? `Rescue ${toGo} more species to pick up new signals.`
              : "Every signal has been picked up."}
          </p>
        </div>
        <div className="ency-overall" aria-label={`Encyclopedia ${pctText(overall)} complete`}>
          <span className="ency-overall-pct">{pctText(overall)}</span>
          <span className="bar" aria-hidden="true">
            <span className="bar-fill" style={{ width: pctText(overall) }} />
          </span>
          <span className="small muted">complete</span>
          <DiversityCounter />
        </div>
      </header>

      <ul className="ency-grid">
        {ordered.map((s) => {
          const locked = !isUnlocked(s.id, ok.waves, unlock.wave);
          const found = !locked && isRevealed(s.id, progress);
          const isNew = newIds.includes(s.id);
          const full1 = ok.byId[s.id];
          const pct = found && full1 ? completionOf(full1, progress).fraction : 0;
          const dv = diversityValueOf(s);
          const cls = `ency-card ${locked ? "locked" : found ? "found" : "hidden"} ${isNew && !reduced ? "reveal" : ""}`;
          const inner = (
            <>
              <span className="ency-frame">
                <SpeciesPortrait id={s.id} silhouette={!found} lit={!locked && !found} />
                {isNew && !reduced && <span className="ency-sparkle" aria-hidden="true" />}
              </span>
              <span className="ency-name">{found ? s.name : "???"}</span>
              {found && (
                <span className="ency-diversity" title={DIVERSITY_TIP}>
                  <DiversityIcon small />
                  {dv}
                </span>
              )}
              {locked ? (
                <span className="locked-badge">
                  <Sprite name="locked-badge" width={16} height={16} scale={1} fallback={null} /> locked
                </span>
              ) : found ? (
                <span className="ency-pct">
                  <span className="bar small" aria-hidden="true">
                    <span className="bar-fill" style={{ width: pctText(pct) }} />
                  </span>
                  {pctText(pct)}
                </span>
              ) : (
                <span className="ency-hint">
                  {isNew ? "New signal!" : isFound(s.id, progress) ? "Signal found: travel there" : "Signal on the map"}
                </span>
              )}
            </>
          );
          return (
            <li key={s.id} className={cls}>
              {found ? (
                <Link to={`/encyclopedia/${s.id}`} className="ency-card-inner" aria-label={`${s.name}: ${pctText(pct)} complete, diversity value ${dv} of 5`}>
                  {inner}
                </Link>
              ) : (
                <div
                  className="ency-card-inner"
                  aria-label={locked ? "Locked species: rescue more species to detect its signal" : "Undiscovered species: travel to its signal on the map"}
                  role="img"
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
