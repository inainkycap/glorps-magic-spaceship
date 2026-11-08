import { cutLabel, hasSurvivalCurves } from "../game/sanctuary";
import type { SanctuarySimResponse } from "../types";

const W = 640;
const H = 280;
const M = { top: 14, bottom: 34, left: 44 };
const PH = H - M.top - M.bottom;
const LABEL_GAP = 13;
/** End labels: the pixel font is monospaced, 1em (9 user units) per character. */
const CHAR_W = 9;
const LABEL_PAD = 8; // between the plot and the labels
const MAX_LABEL_CHARS = 18; // longer labels are cut with "…" (full text on hover)
const MIN_RIGHT = 96;
const fitLabel = (name: string, suffix: string) => cutLabel(name, suffix, MAX_LABEL_CHARS);

/** Distinct, soft colours for species lines (stable per species via colourFor). */
const PALETTE = ["#9fd3b4", "#e2c991", "#d99a9a", "#8fb0d8", "#c3a3d8", "#f0b27a", "#7fc8c8", "#d8d878", "#e89ab8", "#b8c4a0"];

/**
 * Hand-written SVG (per CLAUDE.md): for each species, the % of futures where it's
 * still alive, by year, labelled at the line end; plus a dashed "expected species
 * alive" line (sum of those probabilities, as a share of the species placed).
 * `previous` (compare mode) is drawn underneath, faded.
 */
export default function SurvivalChart({
  run,
  previous,
  nameOf,
}: {
  run: SanctuarySimResponse;
  previous?: SanctuarySimResponse | null;
  nameOf: (id: string) => string;
}) {
  const ids = [...new Set([...run.per_species.map((s) => s.species_id), ...(previous?.per_species.map((s) => s.species_id) ?? [])])];
  const colourFor = (id: string) => PALETTE[ids.indexOf(id) % PALETTE.length];
  const lastYear = Math.max(...run.years, ...(previous?.years ?? []), 1);
  const expected = (r: SanctuarySimResponse) =>
    r.years.map((_, i) => r.per_species.reduce((s, sp) => s + (sp.survival_by_year?.[i] ?? 0), 0));
  const n = run.per_species.length;
  const expNow = expected(run);
  const pctText = (p: number) => `${Math.round(p * 100)}%`;
  const labelTexts = [
    ...run.per_species.map((s) => ({ full: `${nameOf(s.species_id)} ${pctText(s.survival_probability)}`, text: fitLabel(nameOf(s.species_id), pctText(s.survival_probability)) })),
    { full: `expected ${expNow[expNow.length - 1].toFixed(1)} of ${n} species alive`, text: fitLabel("expected", `${expNow[expNow.length - 1].toFixed(1)} of ${n}`) },
  ];
  // Reserve exactly enough room on the right for the longest (possibly cut) label.
  const right = Math.max(MIN_RIGHT, LABEL_PAD + CHAR_W * Math.max(...labelTexts.map((l) => l.text.length)) + 4);
  const PW = W - M.left - right;
  const x = (year: number) => M.left + (year / lastYear) * PW;
  const y = (pct: number) => M.top + PH - (pct / 100) * PH;
  const line = (years: number[], vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(years[i]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const asPct = (e: number[], count: number) => e.map((v) => (count > 0 ? (v / count) * 100 : 0));

  // End labels, pushed apart so they don't overlap.
  const labels = [
    ...run.per_species.map((s, i) => ({
      key: s.species_id,
      ...labelTexts[i],
      colour: colourFor(s.species_id),
      y: y(s.survival_probability * 100),
      dashed: false,
    })),
    {
      key: "__expected",
      ...labelTexts[labelTexts.length - 1],
      colour: "var(--star)",
      y: y(asPct(expNow, n)[expNow.length - 1]),
      dashed: true,
    },
  ].sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + LABEL_GAP);
  const overflow = labels.length ? labels[labels.length - 1].y - (H - M.bottom) : 0;
  if (overflow > 0) labels.forEach((l) => (l.y -= overflow));

  const ticksX = Array.from({ length: Math.floor(lastYear / 10) + 1 }, (_, i) => i * 10);

  return (
    <svg
      className="survival-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Chance each species is still alive over ${lastYear} years: ${run.per_species
        .map((s) => `${nameOf(s.species_id)} ${Math.round(s.survival_probability * 100)}%`)
        .join(", ")}. Expected ${expNow[expNow.length - 1].toFixed(1)} of ${n} species alive at the end.`}
    >
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <line x1={M.left} x2={M.left + PW} y1={y(p)} y2={y(p)} className="fan-grid" />
          <text x={M.left - 6} y={y(p) + 3} className="fan-tick" textAnchor="end">
            {p}%
          </text>
        </g>
      ))}
      {ticksX.map((t) => (
        <text key={t} x={x(t)} y={H - M.bottom + 16} className="fan-tick" textAnchor="middle">
          +{t}
        </text>
      ))}
      <text x={M.left + PW / 2} y={H - 4} className="fan-axis" textAnchor="middle">
        years from now · % of futures where each species is alive
      </text>

      {previous && hasSurvivalCurves(previous) && (
        <g className="survival-previous">
          {previous.per_species.map((s) => (
            <path key={s.species_id} d={line(previous.years, s.survival_by_year!.map((v) => v * 100))} stroke={colourFor(s.species_id)} className="survival-line prev" />
          ))}
          <path d={line(previous.years, asPct(expected(previous), previous.per_species.length))} className="survival-expected prev" />
        </g>
      )}

      {run.per_species.map((s) => (
        <path key={s.species_id} d={line(run.years, s.survival_by_year!.map((v) => v * 100))} stroke={colourFor(s.species_id)} className="survival-line" />
      ))}
      <path d={line(run.years, asPct(expNow, n))} className="survival-expected" />

      {labels.map((l) => (
        <text key={l.key} x={M.left + PW + LABEL_PAD} y={l.y + 3} fill={l.colour} className={`survival-label ${l.dashed ? "dashed" : ""}`}>
          <title>{l.full}</title>
          {l.text}
        </text>
      ))}
    </svg>
  );
}
