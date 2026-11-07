import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * A pixel-art sprite from public/sprites/<name>.png.
 *
 * The PNG is a horizontal strip of `frames` equal frames, each `width`×`height`
 * source pixels. It's drawn at `scale`× with nearest-neighbour scaling and,
 * if frames > 1, animated with CSS steps() at `fps` (frozen on frame 0 under
 * prefers-reduced-motion). If the image fails to load, `fallback` is rendered
 * instead (default: nothing). See ART_TODO.md for the sprite list.
 */
export interface SpriteProps {
  name: string;
  width: number;
  height: number;
  frames?: number;
  fps?: number;
  scale?: number;
  flip?: boolean;
  className?: string;
  /** Accessible label; omit for decorative sprites. */
  label?: string;
  fallback?: ReactNode;
}

const spriteUrl =(name: string) => `${import.meta.env.BASE_URL}sprites/${name}.png`;

export default function Sprite({
  name,
  width,
  height,
  frames = 1,
  fps = 8,
  scale = 2,
  flip = false,
  className = "",
  label,
  fallback = null,
}: SpriteProps) {
  const src = spriteUrl(name);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <>{fallback}</>;

  const w = width * scale;
  const h = height * scale;
  const style = {
    width: w,
    height: h,
    backgroundImage: `url("${src}")`,
    backgroundSize: `${w * frames}px ${h}px`,
    "--sheet-w": `${w * frames}px`,
    "--frames": frames,
    "--duration": `${frames / fps}s`,
    transform: flip ? "scaleX(-1)" : undefined,
  } as CSSProperties;

  return (
    <span
      className={`sprite ${frames > 1 ? "sprite-anim" : ""} ${className}`}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Hidden probe: detects a missing/broken file so we can show the fallback. */}
      <img src={src} alt="" hidden onError={() => setFailedSrc(src)} />
    </span>
  );
}
