import Sprite from "./Sprite";

// Glorp, from a horizontal-strip sprite sheet in public/sprites/:
//   glorp-idle.png / glorp-fly.png — 32×32 frames (see ART_TODO.md).
// If the sheet fails to load, falls back to the built-in pixel-grid placeholder.

const PIXELS = [
  "....GGGG....",
  "...GEGGEG...",
  "...GGddGG...",
  "..cGGGGGGc..",
  ".HHHHHHHHHH.",
  "HHLHHLHHLHHH",
  ".hhhhhhhhhh.",
  "...F....F...",
];

const COLORS: Record<string, string> = {
  G: "#9fd3b4", // Glorp
  d: "#6fa88a", // mouth
  E: "#1d2230", // eyes
  c: "#bcd8e6", // dome glass
  H: "#d8d3c4", // hull
  h: "#a8a394", // hull shadow
  L: "#e2c991", // lights
  F: "#d99a9a", // thrusters
};

const GW = PIXELS[0].length;
const GH = PIXELS.length;

const RECTS = PIXELS.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (COLORS[ch] ? [{ x, y, fill: COLORS[ch] }] : [])),
);

function PixelGridGlorp({ size, flip }: { size: number; flip: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 ${-(GW - GH) / 2} ${GW} ${GW}`}
      shapeRendering="crispEdges"
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      role="img"
      aria-label="Glorp"
    >
      {RECTS.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

const FRAME = 32; // source px per frame

/** Frames in each sheet (see ART_TODO.md). */
const SHEET_FRAMES = { idle: 4, fly: 4, talk: 2 } as const;

export default function GlorpSprite({
  size = 64,
  flip = false,
  className,
  variant = "idle",
  frames,
  fps = 6,
}: {
  size?: number; // width and height in CSS px (use a multiple of 32 for crisp pixels)
  flip?: boolean; // face left
  className?: string;
  variant?: "idle" | "fly" | "talk"; // which sheet: glorp-idle.png / glorp-fly.png / glorp-talk.png
  frames?: number; // frames in the sheet's horizontal strip (default: per variant)
  fps?: number;
}) {
  frames ??= SHEET_FRAMES[variant];
  return (
    <Sprite
      name={`glorp-${variant}`}
      width={FRAME}
      height={FRAME}
      scale={size / FRAME}
      frames={frames}
      fps={fps}
      flip={flip}
      className={className}
      label="Glorp"
      fallback={<PixelGridGlorp size={size} flip={flip} />}
    />
  );
}
