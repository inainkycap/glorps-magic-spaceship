import { formatYear } from "../geo";
import Sprite from "./Sprite";

export interface EraMarker {
  id: string;
  year: number;
  label: string;
  saved: boolean;
}

/**
 * Era bar along the bottom of the map.
 * - Glorp marker + vertical rule at the current year, year label above it,
 *   and the track filled up to that year.
 * - Species eras as small markers; the selected target era (if different) as a ghost.
 * - "◀ Further back" / "Forward ▶" step the target between eras that have
 *   species; "Time travel" goes there.
 *
 * TODO(stretch): make the Glorp marker a draggable slider (pointer + arrow keys,
 * role="slider") that snaps to species eras and sets the target.
 */
export default function EraTimeline({
  current,
  target,
  markers,
  range: [start, end],
  busy,
  onBack,
  onForward,
  onTravel,
}: {
  current: number;
  target: number;
  markers: EraMarker[];
  range: [number, number];
  /** True during a trip: controls disabled. */
  busy: boolean;
  onBack: (() => void) | null; // null = no earlier era
  onForward: (() => void) | null; // null = no later era
  onTravel: () => void;
}) {
  const pct = (y: number) => Math.min(100, Math.max(0, ((y - start) / (end - start)) * 100));
  const span = end - start;
  const step = span > 1000 ? 200 : span > 400 ? 100 : 50;
  const ticks: number[] = [];
  for (let y = Math.ceil(start / step) * step; y <= end; y += step) ticks.push(y);
  const canTravel = !busy && target !== current;

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button className="px-button" onClick={onBack ?? undefined} disabled={busy || !onBack}>
          <Sprite name="arrow-left" width={16} height={16} scale={1} fallback="◀" /> Further back
        </button>
        <button
          className={`px-button primary ${canTravel ? "ready" : ""}`}
          onClick={onTravel}
          disabled={!canTravel}
          aria-label={`Time travel to ${formatYear(target)}`}
        >
          <Sprite name="icon-time" width={16} height={16} scale={1} fallback="⌛" /> Time travel
          {target !== current && <span className="timeline-target-label"> → {formatYear(target)}</span>}
        </button>
        <button className="px-button" onClick={onForward ?? undefined} disabled={busy || !onForward}>
          Forward <Sprite name="arrow-right" width={16} height={16} scale={1} fallback="▶" />
        </button>
      </div>

      <div
        className="timeline-track"
        role="meter"
        aria-label="Current era"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={current}
        aria-valuetext={formatYear(current)}
      >
        <div className="timeline-line" />
        <div className="timeline-fill" style={{ width: `${pct(current)}%` }} />
        {ticks.map((y) => (
          <span key={y} className="timeline-tick" style={{ left: `${pct(y)}%` }}>
            {formatYear(y)}
          </span>
        ))}
        {markers.map((m) => (
          <span
            key={m.id}
            className={`timeline-species ${m.year === current ? "current" : ""}`}
            style={{ left: `${pct(m.year)}%` }}
            title={`${m.label} (${formatYear(m.year)})`}
          >
            <Sprite name="timeline-species" width={8} height={8} fallback={<span className="timeline-species-fallback" />} />
          </span>
        ))}
        {target !== current && (
          <span className="timeline-target" style={{ left: `${pct(target)}%` }} aria-hidden="true" />
        )}
        <div className="timeline-now" style={{ left: `${pct(current)}%` }}>
          <span className="timeline-now-year">{formatYear(current)}</span>
          <Sprite name="timeline-glorp" width={16} height={16} frames={2} fps={3} fallback={<span className="timeline-now-fallback" />} />
          <span className="timeline-now-rule" />
        </div>
      </div>
    </div>
  );
}
