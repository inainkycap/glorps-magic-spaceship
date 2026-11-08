import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Sprite from "../components/Sprite";
import { DISASTERS } from "../game/sanctuary";

const POP_W = 300;
const EDGE = 8; // keep this far from the viewport edges
const GAP = 6; // between the button and the popover

/** Where to put the popover: right-aligned to the button, shifted to stay on screen, above or below (whichever has more room). */
function placeNear(button: HTMLElement): CSSProperties {
  const r = button.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(POP_W, vw - 2 * EDGE);
  const left = Math.min(Math.max(EDGE, r.right - width), vw - width - EDGE);
  const above = r.top > vh - r.bottom;
  return above
    ? { left, width, bottom: vh - r.top + GAP, maxHeight: r.top - GAP - EDGE }
    : { left, width, top: r.bottom + GAP, maxHeight: vh - r.bottom - GAP - EDGE };
}

/**
 * The "?" button explaining dome disasters. The popover is position: fixed (so a
 * scrolling column can't clip it), kept inside the viewport, and closes on Esc,
 * an outside click, scroll or resize.
 */
export default function DisastersHelp() {
  const [at, setAt] = useState<CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    const onScroll = (e: Event) => {
      if (!popRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [at]);

  return (
    <div className="disasters-help">
      <button
        ref={buttonRef}
        className="px-button icon help-btn"
        aria-expanded={!!at}
        aria-controls={at ? popId : undefined}
        aria-label="Dome disasters: what can happen"
        onClick={() => setAt((cur) => (cur ? null : placeNear(buttonRef.current!)))}
      >
        ?
      </button>
      <span className="small muted">Dome disasters</span>
      {at && (
        <div ref={popRef} id={popId} className="disasters-pop" role="note" style={at}>
          <ul className="disasters">
            {DISASTERS.map((d) => (
              <li key={d.id}>
                <span className="disaster-icon">
                  <Sprite name={`disaster-${d.id}`} width={16} height={16} fallback={<span className="disaster-fallback" />} />
                </span>
                <span className="disaster-text">
                  <strong>{d.label}</strong>: {d.text}
                </span>
              </li>
            ))}
          </ul>
          <p className="disasters-note">They hit everyone inside one dome at once. Other domes are safe.</p>
        </div>
      )}
    </div>
  );
}
