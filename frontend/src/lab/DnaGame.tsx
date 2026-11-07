import { useEffect, useEffectEvent, useRef, useState } from "react";
import Sprite from "../components/Sprite";
import { BASES, PARTNER, type Base, type Strand } from "../game/dna";

/** How long a degraded ("?") base shows its real letter when its turn comes. */
const REVEAL_MS = 800;
const TICK_MS = 100;

const baseSprite = (b: Base | "?") => `dna-base-${b === "?" ? "degraded" : b.toLowerCase()}`;

function BaseTile({ base, className = "" }: { base: Base | "?" | null; className?: string }) {
  return (
    <span className={`base-tile ${className}`}>
      {base && (
        <Sprite name={baseSprite(base)} width={16} height={16} fallback={<span className={`base-fallback b-${base === "?" ? "q" : base}`}>{base}</span>} />
      )}
    </span>
  );
}

/**
 * The DNA pairing minigame: for each base of the strand, pick its partner
 * (A↔T, C↔G) before time runs out. Degraded bases show "?" and flash their real
 * letter for a moment when it's their turn. Calls `onFinish` once, with one
 * answer per base (null = not answered in time).
 *
 * No moving UI: feedback is colour only. Mouse, touch, or keys A/T/C/G.
 */
export default function DnaGame({
  strand,
  seconds,
  onFinish,
}: {
  strand: Strand;
  seconds: number;
  onFinish: (answers: (Base | null)[]) => void;
}) {
  const total = strand.bases.length;
  const [answers, setAnswers] = useState<(Base | null)[]>(() => Array(total).fill(null));
  const [index, setIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [elapsed, setElapsed] = useState(0); // ms since start, updated by the clock
  const [turnStart, setTurnStart] = useState(0); // `elapsed` when the current base became active
  const done = useRef(false);

  /** Ends the game exactly once (called by the last pick or by the clock). */
  const complete = (final: (Base | null)[]) => {
    if (done.current) return;
    done.current = true;
    onFinish(final);
  };
  // Effect events always see the latest state, so this ends with the latest answers.
  const timeUp = useEffectEvent(() => complete(answers));

  // Clock: ends the game when time runs out.
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => {
      const ms = performance.now() - t0;
      setElapsed(ms);
      if (ms >= seconds * 1000) timeUp();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [seconds]);

  const pick = (b: Base) => {
    if (done.current || index >= total) return;
    const next = answers.slice();
    next[index] = b;
    setAnswers(next);
    setStreak(b === PARTNER[strand.bases[index]] ? streak + 1 : 0);
    if (index + 1 >= total) {
      complete(next);
    } else {
      setIndex(index + 1);
      setTurnStart(elapsed);
    }
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const k = e.key.toUpperCase();
    if ((BASES as string[]).includes(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      pick(k as Base);
    }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const left = Math.max(0, seconds * 1000 - elapsed);
  const revealing = elapsed - turnStart < REVEAL_MS;

  return (
    <div className="dna-game">
      <div className="dna-hud">
        <span className="dna-progress">
          Base {Math.min(index + 1, total)}/{total}
        </span>
        <span className="dna-timer" role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
          <span className="bar">
            <span className={`bar-fill ${left < 5000 ? "poor" : ""}`} style={{ width: `${(left / (seconds * 1000)) * 100}%` }} />
          </span>
          <span className="dna-secs">{Math.ceil(left / 1000)}s</span>
        </span>
        <span className="dna-streak">{streak >= 3 ? `Streak ${streak}!` : ""}</span>
      </div>

      <div className="dna-strands" aria-hidden="true">
        <div className="strand-row">
          {strand.bases.map((b, i) => {
            const degraded = strand.degraded.has(i);
            const answered = answers[i] !== null;
            const shown = !degraded || answered || (i === index && revealing) ? b : "?";
            return <BaseTile key={i} base={shown} className={`${i === index ? "current" : ""} ${degraded ? "degraded" : ""}`} />;
          })}
        </div>
        <div className="strand-row answers">
          {strand.bases.map((b, i) => {
            const a = answers[i];
            const state = a === null ? (i === index ? "current" : "empty") : a === PARTNER[b] ? "right" : "wrong";
            return <BaseTile key={i} base={a} className={state} />;
          })}
        </div>
      </div>

      {/* What screen readers get instead of the tiles. */}
      <p className="visually-hidden" aria-live="polite">
        {index < total
          ? `Base ${index + 1}: ${strand.degraded.has(index) && !revealing ? "degraded, shown briefly" : strand.bases[index]}. Pick its partner.`
          : ""}
      </p>

      <div className="dna-pad" role="group" aria-label="Pick the partner base">
        {BASES.map((b) => (
          <button key={b} className={`px-button dna-key b-${b}`} onClick={() => pick(b)} aria-label={`${b} (key ${b})`}>
            <Sprite name={baseSprite(b)} width={16} height={16} fallback={<span className={`base-fallback b-${b}`}>{b}</span>} />
          </button>
        ))}
      </div>
      <p className="dna-hint">A pairs with T, C pairs with G · keys A T C G work too</p>
    </div>
  );
}
