import { formatYear } from "../geo";

export interface EraMarker {
  id: string;
  year: number;
  label: string;
  saved: boolean;
}

/** Horizontal era bar: century ticks, a marker per species, and Glorp's current year. */
export default function EraTimeline({
  current,
  markers,
  range: [start, end],
}: {
  current: number;
  markers: EraMarker[];
  range: [number, number];
}) {
  const pct = (y: number) => ((y - start) / (end - start)) * 100;
  const span = end - start;
  const step = span > 1000 ? 200 : span > 400 ? 100 : 50;
  const ticks: number[] = [];
  for (let y = Math.ceil(start / step) * step; y <= end; y += step) ticks.push(y);

  return (
    <div className="timeline">
      <div className="timeline-readout">
        <span className="muted">ERA</span>
        <span className="timeline-year">{formatYear(current)}</span>
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
        {ticks.map((y) => (
          <span key={y} className="timeline-tick" style={{ left: `${pct(y)}%` }}>
            {formatYear(y)}
          </span>
        ))}
        {markers.map((m) => (
          <span
            key={m.id}
            className={`timeline-marker ${m.saved ? "saved" : ""}`}
            style={{ left: `${pct(m.year)}%` }}
            title={`${m.label} (${formatYear(m.year)})`}
          />
        ))}
        <span className="timeline-now" style={{ left: `${pct(current)}%` }} />
      </div>
    </div>
  );
}
