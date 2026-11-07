import type { SanctuarySimResponse } from "../types";

const W = 640;
const H = 260;
const M = { top: 16, right: 16, bottom: 34, left: 44 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

/**
 * Hand-written SVG fan chart of how many species are alive over time
 * (no chart library, per CLAUDE.md): 90% band (p5–p95), 50% band (p25–p75),
 * median (p50), 25 sample runs, and the worst-case (p5) line. `previous`
 * (compare mode) is drawn underneath, faded, with dashed median and p5 lines.
 */
export default function SpeciesFanChart({
  run,
  previous,
  speciesTotal,
}: {
  run: SanctuarySimResponse;
  previous?: SanctuarySimResponse | null;
  speciesTotal: number;
}) {
  const yMax = Math.max(1, speciesTotal);
  const lastYear = Math.max(...run.years, ...(previous?.years ?? []), 1);
  const x = (year: number) => M.left + (year / lastYear) * PW;
  const y = (v: number) => M.top + PH - (v / yMax) * PH;

  // Species alive is a whole number per year, so every path is drawn as steps
  // (the value holds until the next year), not as slanted interpolation.
  const f = (n: number) => n.toFixed(1);
  const line = (years: number[], vals: number[]) =>
    `M${f(x(years[0]))},${f(y(vals[0]))}` + vals.slice(1).map((v, i) => ` H${f(x(years[i + 1]))} V${f(y(v))}`).join("");
  const band = (years: number[], lo: number[], hi: number[]) => {
    const n = years.length - 1;
    let back = ` L${f(x(years[n]))},${f(y(lo[n]))}`;
    for (let i = n - 1; i >= 0; i--) back += ` V${f(y(lo[i]))} H${f(x(years[i]))}`;
    return `${line(years, hi)}${back} Z`;
  };

  const yTicks = Array.from({ length: yMax + 1 }, (_, i) => i);
  const xStep = lastYear > 60 ? 20 : 10;
  const xTicks = Array.from({ length: Math.floor(lastYear / xStep) + 1 }, (_, i) => i * xStep);
  const last = (a: number[]) => a[a.length - 1];

  return (
    <svg
      className="fan-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Species alive over ${lastYear} years: median ${last(run.species_alive.p50)} of ${speciesTotal} at the end, 90% of runs between ${last(run.species_alive.p5)} and ${last(run.species_alive.p95)}.${previous ? ` Previous run median: ${last(previous.species_alive.p50)}.` : ""}`}
    >
      {/* axes */}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className="fan-grid" />
          <text x={M.left - 8} y={y(t) + 3} className="fan-tick" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={`x${t}`} x={x(t)} y={H - M.bottom + 16} className="fan-tick" textAnchor="middle">
          +{t}
        </text>
      ))}
      <text x={M.left + PW / 2} y={H - 4} className="fan-axis" textAnchor="middle">
        years from now
      </text>
      <text x={12} y={M.top + PH / 2} className="fan-axis" textAnchor="middle" transform={`rotate(-90 12 ${M.top + PH / 2})`}>
        species alive
      </text>

      {/* previous run (compare mode), faded underneath */}
      {previous && (
        <g className="fan-previous">
          <path d={band(previous.years, previous.species_alive.p5, previous.species_alive.p95)} className="fan-band90" />
          <path d={band(previous.years, previous.species_alive.p25, previous.species_alive.p75)} className="fan-band50" />
          <path d={line(previous.years, previous.species_alive.p50)} className="fan-median prev" />
        </g>
      )}
      {/* worst case (5th percentile) lines: the number that splitting improves */}
      {previous && <path d={line(previous.years, previous.species_alive.p5)} className="fan-p5 prev" />}

      {/* current run */}
      <path d={band(run.years, run.species_alive.p5, run.species_alive.p95)} className="fan-band90" />
      <path d={band(run.years, run.species_alive.p25, run.species_alive.p75)} className="fan-band50" />
      {run.sample_paths.map((p, i) => (
        <path key={i} d={line(run.years, p)} className="fan-sample" />
      ))}
      <path d={line(run.years, run.species_alive.p5)} className="fan-p5" />
      <path d={line(run.years, run.species_alive.p50)} className="fan-median" />
    </svg>
  );
}
