import Sprite from "./Sprite";

/**
 * A species' resident sprite (public/sprites/resident-<id>.png, 2 frames of 16×16).
 * `silhouette` blacks it out with a CSS filter (no extra art); `lit` adds a glow
 * (unlocked, waiting to be found). Missing sprite: a blob of the same size.
 */
export default function SpeciesPortrait({
  id,
  scale = 3,
  silhouette = false,
  lit = false,
}: {
  id: string;
  scale?: number;
  silhouette?: boolean;
  lit?: boolean;
}) {
  const size = 16 * scale;
  return (
    <span className={`portrait ${silhouette ? "silhouette" : ""} ${lit ? "lit" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <Sprite
        name={`resident-${id}`}
        width={16}
        height={16}
        frames={2}
        animate={false}
        scale={scale}
        fallback={<span className="portrait-fallback" style={{ width: size * 0.75, height: size * 0.75 }} />}
      />
    </span>
  );
}
