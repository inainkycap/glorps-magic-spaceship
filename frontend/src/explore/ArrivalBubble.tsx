import { useEffect, useEffectEvent, useRef } from "react";

/**
 * Glorp's greeting when you arrive in Explore: the species' `intro` in a speech
 * bubble from Glorp (who stands in the scene's corner), with "Learn more"
 * (opens the field guide) and "Let's explore" (closes). Escape also closes.
 */
export default function ArrivalBubble({
  intro,
  onLearnMore,
  onClose,
}: {
  intro: string;
  onLearnMore: () => void;
  onClose: () => void;
}) {
  const learnRef = useRef<HTMLButtonElement>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    learnRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="arrival-bubble" role="dialog" aria-label="Glorp says">
      <p className="arrival-text">{intro}</p>
      <div className="bubble-actions">
        <button ref={learnRef} className="px-button primary w-m" onClick={onLearnMore}>
          Learn more
        </button>
        <button className="px-button w-m" onClick={onClose}>
          Let's explore
        </button>
      </div>
    </div>
  );
}
