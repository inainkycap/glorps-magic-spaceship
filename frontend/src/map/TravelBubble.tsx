import { useEffect, useEffectEvent, useId, useRef } from "react";
import Sprite from "../components/Sprite";
import { ZorpsPrice } from "../components/ZorpsCounter";
import { canAfford } from "../game/zorps";
import { describeJump } from "../game/timeJump";
import { formatYear } from "../geo";
import type { SpeciesSummary } from "../types";
import { useMapView } from "./MapViewContext";

const BUBBLE_W = 400;
const EST_H = 200; // for deciding whether it fits above the pin
const PIN_CLEARANCE = 92; // pin sprite + label above the pin tip
const HUD_H = 64;
const EDGE = 12;
const CONTROLS_W = 72; // zoom buttons on the right
const FRAME_PX = 12; // bubble.png border (6px) drawn at 2×

/**
 * The pixel font has no "→" glyph (the browser substitutes a tiny one), so draw
 * the arrow as a CSS pixel shape. Screen readers still get the plain text.
 */
function JumpText({ text }: { text: string }) {
  const parts = text.split(" → ");
  if (parts.length !== 2) return <>{text}</>;
  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {parts[0]} <span className="inline-arrow" /> {parts[1]}
      </span>
    </>
  );
}

/**
 * Speech bubble from a species pin: what the trip costs and [Travel] [Cancel].
 * Sits above the pin (below it if there's no room) and follows it as the map
 * moves. Escape cancels. Travel is disabled, with a message, if Zorps are short.
 */
export default function TravelBubble({
  species,
  fromYear,
  cost,
  zorps,
  here,
  onTravel,
  onCancel,
}: {
  species: SpeciesSummary;
  /** Glorp's current era, for the "1600 → 1870 · 270 years into the future" line. */
  fromYear: number;
  cost: number;
  zorps: number;
  /** Glorp is already at this place and era: no trip needed. */
  here: boolean;
  onTravel: () => void;
  onCancel: () => void;
}) {
  const view = useMapView();
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const affordable = canAfford(zorps, cost);

  // Focus the main action when the bubble opens (Cancel if Travel is disabled).
  useEffect(() => {
    (affordable ? primaryRef : cancelRef).current?.focus({ preventScroll: true });
  }, [species.id, affordable]);

  const cancel = useEffectEvent(() => onCancel());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { w: vw, h: vh } = view.viewport;
  const tip = view.toScreen(species.lon, species.lat);
  const above = tip.y - PIN_CLEARANCE - EST_H > HUD_H;
  const left = Math.max(EDGE, Math.min(vw - CONTROLS_W - BUBBLE_W, tip.x - BUBBLE_W / 2));
  const tailX = Math.max(20, Math.min(BUBBLE_W - 20, tip.x - left));
  const position = above ? { left, bottom: vh - (tip.y - PIN_CLEARANCE) } : { left, top: tip.y + 12 };

  return (
    <div
      className={`travel-bubble ${above ? "above" : "below"}`}
      style={{ ...position, width: BUBBLE_W }}
      role="dialog"
      aria-labelledby={titleId}
      data-map-ui
    >
      {/* absolute children are placed inside the 12px frame border, hence the offset */}
      <span className="bubble-tail" style={{ left: tailX - FRAME_PX }} aria-hidden="true">
        <Sprite name="bubble-tail" width={16} height={8} fallback={<span className="bubble-tail-fallback" />} />
      </span>
      <h2 id={titleId} className="bubble-title">
        {species.name}
      </h2>
      <p className="bubble-sub">
        {species.location} · {formatYear(species.era_year)}
      </p>
      <p className="bubble-jump">
        <JumpText text={describeJump(fromYear, species.era_year)} />
      </p>
      <p className="bubble-cost">
        {here ? (
          "Glorp is already here: free."
        ) : (
          <>
            Costs <ZorpsPrice amount={cost} /> (you have <ZorpsPrice amount={zorps} />)
          </>
        )}
      </p>
      {!affordable && (
        <p className="bubble-warning" role="alert">
          Not enough Zorps: you need {cost - zorps} more. Advance time in the Sanctuary to earn some.
        </p>
      )}
      <div className="bubble-actions">
        <button ref={primaryRef} className="px-button primary w-s" onClick={onTravel} disabled={!affordable}>
          {here ? "Explore" : "Travel"}
        </button>
        <button ref={cancelRef} className="px-button w-s" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
