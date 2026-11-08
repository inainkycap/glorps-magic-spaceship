import Sprite from "../components/Sprite";
import { capacityLevel, outbreakBadge } from "../game/sanctuary";

const LEVEL_TEXT = { ok: "", crowded: "crowded", full: "full" } as const;

/**
 * How full a dome is (all species share its capacity): green, amber from 80%
 * ("crowded"), red at 100% ("full").
 */
export function CapacityBar({ total, capacity, compact = false }: { total: number; capacity: number; compact?: boolean }) {
  const level = capacityLevel(total, capacity);
  const fill = Math.min(1, capacity > 0 ? total / capacity : 1);
  return (
    <span
      className={`capacity ${level} ${compact ? "compact" : ""}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={total}
      aria-label={`Capacity: ${total} of ${capacity} places used${LEVEL_TEXT[level] ? `, ${LEVEL_TEXT[level]}` : ""}`}
    >
      <span className="capacity-bar" aria-hidden="true">
        <span className="capacity-fill" style={{ width: `${fill * 100}%` }} />
      </span>
      <span className="capacity-text" aria-hidden="true">
        {total}/{capacity}
        {LEVEL_TEXT[level] && <span className="capacity-level"> {LEVEL_TEXT[level]}</span>}
      </span>
    </span>
  );
}

/** "Outbreak · 3 years left" with the disease icon. */
export function OutbreakBadge({ yearsLeft }: { yearsLeft: number }) {
  const text = outbreakBadge(yearsLeft);
  return (
    <span className="outbreak-badge" title="A disease outbreak is running in this dome">
      <Sprite name="disaster-disease" width={16} height={16} scale={1} fallback={<span className="disaster-fallback small" />} />
      {text}
    </span>
  );
}
