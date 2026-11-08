import { useEffect, useRef, useState } from "react";
import type { EraScale } from "../game/time";
import { formatJumpShort } from "../game/timeJump";
import { formatYear } from "../geo";
import Sprite from "./Sprite";

export interface EraMarker {
  id: string;
  year: number;
  label: string;
}

/**
 * Where a trip through time would go (or is going).
 * - hover:    pointer over a pin; arrow only, faded
 * - selected: travel bubble open; arrow, pulsing target, ghost Glorp
 * - travel:   trip in progress; arrow stays, Glorp's marker rides along it
 */
export interface TimePreview {
  from: number;
  to: number;
  targetId: string;
  mode: "hover" | "selected" | "travel";
}

// Arc geometry, in px. The track is 40px tall with the line at its middle.
const LINE_Y = 20; // from the track's bottom
const ARC_BASE = 18; // arc ends sit just above the 32px era diamonds
const ARC_MAX_H = 26;
const DOT_EVERY = 10;
const GLORP_BASE = 16; // Glorp marker's bottom, above the line

/** Height of the arc above its ends at t ∈ [0, 1] (a parabola). */
const arcLift = (h: number, t: number) => 4 * h * t * (1 - t);

/**
 * Era bar along the bottom of the map. Display-only apart from the species
 * markers, which open that species' travel bubble.
 * - Glorp marker with a vertical rule at the current year, the year label
 *   above it, and the track filled up to that year.
 * - One big marker per species era: filled when it's the current era,
 *   outlined otherwise.
 * - With a `preview`: a dashed pixel arc from Glorp to the target era with an
 *   arrowhead (left = past, right = future) labelled "+270 yrs" / "−270 yrs".
 *
 * TODO(stretch): a draggable era slider (pointer + arrow keys, role="slider")
 * that snaps to species eras.
 */
export default function EraTimeline({
  current,
  markers,
  scale,
  preview,
  disabled,
  onPick,
}: {
  current: number;
  markers: EraMarker[];
  /** From game/time.ts buildEraScale: linear or log, with ticks; recomputed when species load. */
  scale: EraScale;
  preview: TimePreview | null;
  /** True during a trip: markers can't be clicked. */
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pct = (y: number) => Math.min(100, Math.max(0, scale.pos(y) * 100));
  const px = (y: number) => (pct(y) / 100) * width;

  // --- preview arc ---
  const showArc = preview !== null && preview.from !== preview.to && width > 0;
  const x1 = preview ? px(preview.from) : 0;
  const x2 = preview ? px(preview.to) : 0;
  const dir = Math.sign(x2 - x1) || 1;
  const arcH = Math.min(ARC_MAX_H, Math.abs(x2 - x1) * 0.15);

  // During a trip, Glorp's marker rides the arc: lift it by the arc height at its progress.
  let glorpLift = 0;
  if (preview?.mode === "travel" && preview.from !== preview.to) {
    // progress measured along the track (works for log and linear scales alike)
    const p0 = scale.pos(preview.from);
    const p1 = scale.pos(preview.to);
    const t = p1 === p0 ? 1 : Math.min(1, Math.max(0, (scale.pos(current) - p0) / (p1 - p0)));
    glorpLift = arcLift(arcH, t);
  }

  return (
    <div className="timeline">
      <div
        ref={trackRef}
        className="timeline-track"
        role="group"
        aria-label={`Era timeline, Glorp is in ${formatYear(current)}`}
      >
        <div className="timeline-line" />
        <div className="timeline-fill" style={{ width: `${pct(current)}%` }} />
        {scale.ticks.map((t) => (
          <span key={t.year} className="timeline-tick" style={{ left: `${t.pos * 100}%` }} aria-hidden="true">
            {t.label}
          </span>
        ))}

        {showArc && preview && (
          <TimeArrow x1={x1} x2={x2} dir={dir} h={arcH} mode={preview.mode} label={formatJumpShort(preview.from, preview.to)} />
        )}

        {preview?.mode === "selected" && preview.from !== preview.to && (
          <span className="timeline-ghost" style={{ left: x2, bottom: LINE_Y + GLORP_BASE }} aria-hidden="true">
            <Sprite name="timeline-glorp-ghost" width={16} height={16} fallback={<span className="timeline-now-fallback" />} />
          </span>
        )}

        <div
          className="timeline-now"
          style={{ left: `${pct(current)}%`, ["--lift" as string]: `${glorpLift}px` }}
          aria-hidden="true"
        >
          <span className="timeline-now-rule" />
          <span className="timeline-now-glorp">
            <Sprite name="timeline-glorp" width={16} height={16} frames={2} fps={3} fallback={<span className="timeline-now-fallback" />} />
          </span>
          <span className="timeline-now-year">{formatYear(current)}</span>
        </div>

        {markers.map((m) => {
          const isCurrent = m.year === current;
          const target = preview?.targetId === m.id ? (preview.mode === "hover" ? "target-light" : "target") : "";
          return (
            <button
              key={m.id}
              className={`era-marker ${isCurrent ? "current" : ""} ${target}`}
              style={{ left: `${pct(m.year)}%` }}
              onClick={() => onPick(m.id)}
              disabled={disabled}
              title={`${m.label} (${formatYear(m.year)})`}
              aria-label={`${m.label}, ${formatYear(m.year)}${isCurrent ? " (current era)" : ""}: show travel options`}
            >
              <Sprite
                name={isCurrent ? "era-marker-current" : "era-marker"}
                width={16}
                height={16}
                fallback={<span className="era-marker-fallback" />}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Dashed pixel arc from x1 to x2 with an arrowhead at x2 and a jump label at the peak. */
function TimeArrow({
  x1,
  x2,
  dir,
  h,
  mode,
  label,
}: {
  x1: number;
  x2: number;
  dir: number;
  h: number;
  mode: TimePreview["mode"];
  label: string;
}) {
  const dx = x2 - x1;
  const n = Math.max(2, Math.floor(Math.abs(dx) / DOT_EVERY));
  const at = (t: number) => ({ x: x1 + dx * t, y: LINE_Y + ARC_BASE + arcLift(h, t) });

  const dots = [];
  for (let i = 1; i < n; i++) {
    const p = at(i / n);
    if (Math.abs(p.x - x2) < 14) continue; // leave room for the arrowhead
    dots.push(<span key={i} className="arrow-dot" style={{ left: Math.round(p.x) - 2, bottom: Math.round(p.y) - 2 }} />);
  }
  // Arrowhead just before the end, where the low arc is nearly horizontal.
  const tHead = Math.abs(dx) > 16 ? 1 - 8 / Math.abs(dx) : 1;
  const head = at(tHead);

  return (
    <div className={`timeline-arrow ${mode}`} aria-hidden="true">
      {dots}
      <span className="arrow-head" style={{ left: Math.round(head.x) - 8, bottom: Math.round(head.y) - 8 }}>
        <Sprite name="timeline-arrowhead" width={8} height={8} flip={dir < 0} fallback={<span className={`arrow-head-fallback ${dir < 0 ? "left" : ""}`} />} />
      </span>
      {/* During a trip Glorp rides over the peak and its own year label says it all. */}
      {mode !== "travel" && (
        <span className="arrow-label" style={{ left: Math.round((x1 + x2) / 2), bottom: LINE_Y + ARC_BASE + h + 8 }}>
          {label}
        </span>
      )}
    </div>
  );
}
