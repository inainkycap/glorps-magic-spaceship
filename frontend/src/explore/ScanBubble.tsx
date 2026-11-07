import { useEffect, useEffectEvent, useRef } from "react";
import Sprite from "../components/Sprite";
import { discoveryMessage, knownMessage } from "../game/needs";
import type { Hotspot, NeedKey } from "../types";

/**
 * Speech bubble popping out of a scanned hotspot (rendered inside the Explore
 * scene, which is dimmed behind it). A click anywhere on the page, or Escape,
 * closes it.
 * Sits above the hotspot when it's in the lower half of the scene, below otherwise.
 */
export default function ScanBubble({
  hotspot,
  firstScan,
  newNeeds,
  knownNeeds,
  onClose,
}: {
  hotspot: Hotspot;
  /** First time this hotspot was scanned (so the DNA is new). */
  firstScan: boolean;
  /** Needs discovered by this scan (empty if none were new). */
  newNeeds: NeedKey[];
  /** Needs this hotspot reveals that were already known. */
  knownNeeds: NeedKey[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // A click anywhere on the page closes it (bubble, dimmed scene, or outside).
    // Registered a tick later so the click that opened the bubble doesn't count.
    const onClick = () => close();
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [hotspot.id]);

  const above = hotspot.y > 50;
  const x = `${hotspot.x}%`;
  const y = `${hotspot.y}%`;

  return (
    <>
      <span
        className={`scan-tail ${above ? "above" : "below"}`}
        style={{ left: x, top: above ? `calc(${y} - 40px)` : `calc(${y} + 24px)` }}
        aria-hidden="true"
      >
        <Sprite name="bubble-tail" width={16} height={8} fallback={<span className="bubble-tail-fallback" />} />
      </span>
      <div
        ref={ref}
        className="scan-bubble"
        style={{
          // keep the bubble inside the scene; the tail stays on the hotspot
          left: `clamp(172px, ${x}, calc(100% - 172px))`,
          ...(above ? { bottom: `calc(100% - ${y} + 38px)` } : { top: `calc(${y} + 38px)` }),
        }}
        role="dialog"
        aria-label={hotspot.label}
        tabIndex={-1}
      >
        <div className="scan-head">
          <Sprite name={`hotspot-${hotspot.sprite}`} width={16} height={16} fallback={<span className="hotspot-fallback">?</span>} />
          <h2 className="scan-title">{hotspot.label}</h2>
        </div>
        <p className="scan-fact">{hotspot.fact}</p>
        {hotspot.dna && (
          <p className="scan-badge dna">{firstScan ? "DNA fragment found!" : "DNA fragment (already collected)"}</p>
        )}
        {newNeeds.length > 0 && <p className="scan-badge need">{discoveryMessage(newNeeds)}</p>}
        {knownNeeds.length > 0 && <p className="scan-badge known">{knownMessage(knownNeeds)}</p>}
        <p className="scan-hint">Click anywhere or press Esc to close</p>
      </div>
    </>
  );
}
