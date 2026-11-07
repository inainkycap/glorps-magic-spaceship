// Placeholder Glorp: a little alien in a saucer, drawn as a pixel grid.
// Swap for a real sprite sheet later; keep the same props.

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
  G: "#7cf8d0", // Glorp
  d: "#3fbf96", // mouth
  E: "#07061a", // eyes
  c: "#9fd8ff", // dome glass
  H: "#c9c5ea", // hull
  h: "#8f8ac2", // hull shadow
  L: "#ffd166", // lights
  F: "#ff6b8b", // thrusters
};

const W = PIXELS[0].length;
const H = PIXELS.length;

const RECTS = PIXELS.flatMap((row, y) =>
  [...row].flatMap((ch, x) => (COLORS[ch] ? [{ x, y, fill: COLORS[ch] }] : [])),
);

export default function GlorpSprite({
  size = 48,
  flip = false,
  className,
}: {
  size?: number; // width in CSS px
  flip?: boolean; // face left
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={(size * H) / W}
      viewBox={`0 0 ${W} ${H}`}
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
