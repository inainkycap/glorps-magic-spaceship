import type { CSSProperties } from "react";
import Sprite from "../components/Sprite";
import { domeTint } from "../game/sanctuary";
import type { DomeConditions } from "../types";

const base = import.meta.env.BASE_URL;

/** Ground colour per terrain, under the ground sprite (and the fallback if it's missing). */
const GROUND_FALLBACK: Record<DomeConditions["terrain"], string> = {
  forest: "#4f6a44",
  grassland: "#7c9a5a",
  wetland: "#4f7a78",
  tundra: "#c8ccc4",
};

/** Cheap deterministic hash → [0, 1). */
const hash01 = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A sealed glass dome on Glorp's planet, seen from the side: sky tinted by its
 * conditions (temperature → hue, humidity → haze, low oxygen → gloom, low
 * pressure → paler), ground and plants for its terrain, and residents
 * wandering about. Purely visual; re-renders live as conditions change.
 * Residents stand still under prefers-reduced-motion (CSS).
 */
export default function DomeView({
  conditions,
  residents,
  size,
  label,
}: {
  conditions: DomeConditions;
  residents: Record<string, number>;
  /** Diameter in CSS px. */
  size: number;
  /** Accessible description, e.g. "Dome Zib: forest, 24 °C, 12 residents". */
  label: string;
}) {
  const tint = domeTint(conditions);
  const scale = size >= 240 ? 2 : 1; // resident sprites: 16px or 32px
  const cap = size >= 240 ? 16 : 8;

  // Up to `cap` resident sprites, shared fairly between species.
  const entries = Object.entries(residents).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const shown: string[] = [];
  for (const [id, n] of entries) {
    const k = Math.max(1, Math.round((n / Math.max(total, 1)) * Math.min(cap, total)));
    for (let i = 0; i < Math.min(k, n); i++) shown.push(id);
  }

  const style = {
    width: size,
    height: size,
    "--dome-sky": tint.sky,
    "--dome-haze": tint.haze,
    "--dome-gloom": tint.gloom,
    "--ground-fallback": GROUND_FALLBACK[conditions.terrain],
    "--ground": `url("${base}sprites/dome-ground-${conditions.terrain}.png")`,
    "--plants": `url("${base}sprites/dome-plants-${conditions.terrain}.png")`,
  } as CSSProperties;

  return (
    <div className="dome-view" style={style} role="img" aria-label={label}>
      <div className="dome-sky" />
      <div className="dome-plants" />
      <div className="dome-ground" />
      {shown.slice(0, cap).map((id, i) => {
        const seed = i * 7 + id.length * 13;
        const left = 14 + hash01(seed) * 62; // % across the floor
        const bottom = 14 + hash01(seed + 1) * 14; // % up from the bottom
        const wander = {
          left: `${left}%`,
          bottom: `${bottom}%`,
          "--dx": `${(hash01(seed + 2) - 0.5) * size * 0.3}px`,
          "--dur": `${3 + hash01(seed + 3) * 4}s`,
          "--delay": `${-hash01(seed + 4) * 6}s`,
          zIndex: Math.round(100 - bottom),
        } as CSSProperties;
        return (
          <span key={`${id}-${i}`} className="dome-resident" style={wander}>
            <Sprite
              name={`resident-${id}`}
              width={16}
              height={16}
              frames={2}
              fps={4}
              scale={scale}
              fallback={<span className="resident-fallback" style={{ width: 8 * scale, height: 8 * scale }} />}
            />
          </span>
        );
      })}
      <div className="dome-haze" />
      <div className="dome-glass" />
    </div>
  );
}
