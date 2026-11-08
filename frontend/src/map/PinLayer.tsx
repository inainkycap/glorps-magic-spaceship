import type { CSSProperties } from "react";
import SpeciesPortrait from "../components/SpeciesPortrait";
import Sprite from "../components/Sprite";
import { formatYear } from "../geo";
import type { SpeciesSummary } from "../types";
import { useMapView } from "./MapViewContext";

const SPARKS = 8;

/**
 * Species pins in screen space (constant size at any zoom). A pin appears on
 * every visible copy of the wrapping world. Only unlocked species get a pin.
 *
 * - Visited: the regular pin with the species' name.
 * - Not visited yet: the species' black silhouette, "Unknown signal · <era>". Its name
 *   and portrait are revealed only once visited (opening the pin just "finds" it).
 * - Newly unlocked (`newIds`): pops in with a sparkle burst (not under reduced motion).
 *
 * Layout note: the positioned element is a zero-size anchor at the pin tip;
 * the <button> hangs off it with plain offsets and NO transform, so nothing
 * (e.g. a :active press style) can move it out from under the pointer
 * mid-click. That was the v1 "pin jumps and travel doesn't start" bug. (The
 * pop-in animates an inner wrapper, never the button.)
 */
export default function PinLayer({
  species,
  currentEra,
  saved,
  visited,
  newIds,
  animate,
  selectedId,
  disabled,
  onPick,
  onHover,
}: {
  species: SpeciesSummary[];
  currentEra: number;
  saved: string[];
  visited: string[];
  newIds: string[];
  /** false under reduced motion: no pop-in or sparkles. */
  animate: boolean;
  /** Pin whose travel bubble is open. */
  selectedId: string | null;
  disabled: boolean;
  onPick: (s: SpeciesSummary) => void;
  /** Pointer or keyboard focus entered (id) / left (null) a pin. */
  onHover: (id: string | null) => void;
}) {
  const view = useMapView();
  return (
    <div className="pin-layer">
      {species.flatMap((s) => {
        const y = view.toScreen(s.lon, s.lat).y;
        const isSaved = saved.includes(s.id);
        const isVisited = visited.includes(s.id);
        const isNew = animate && newIds.includes(s.id);
        const inEra = s.era_year === currentEra;
        const name = isVisited ? s.name : "Unknown signal";
        return view.screenXs(s.lon).map((x, k) => (
          <div key={`${s.id}:${k}`} className="pin-anchor" style={{ left: x, top: y }}>
            <button
              className={`pin ${inEra ? "in-era" : "other-era"} ${isSaved ? "saved" : ""} ${isVisited ? "" : "unvisited"} ${s.id === selectedId ? "selected" : ""}`}
              aria-expanded={s.id === selectedId}
              onClick={() => onPick(s)}
              onPointerEnter={() => onHover(s.id)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(s.id)}
              onBlur={() => onHover(null)}
              disabled={disabled}
              aria-label={
                isVisited
                  ? `Travel to ${s.name}, ${s.location}, ${formatYear(s.era_year)}${isSaved ? " (saved)" : ""}`
                  : `Unknown signal, ${formatYear(s.era_year)}: travel there to find out what it is`
              }
            >
              <span className={`pin-body ${isNew ? "pin-new" : ""}`}>
                <span className="pin-label" aria-hidden="true">
                  {name}
                  <span className="pin-year"> · {formatYear(s.era_year)}</span>
                </span>
                {isVisited ? (
                  <Sprite
                    name={isSaved ? "pin-saved" : "pin"}
                    width={16}
                    height={24}
                    className="pin-sprite"
                    fallback={<span className="pin-fallback" />}
                  />
                ) : (
                  <span className="pin-silhouette">
                    <SpeciesPortrait id={s.id} scale={2} silhouette lit />
                  </span>
                )}
                {isNew && (
                  <span className="sparkle-burst" aria-hidden="true">
                    {Array.from({ length: SPARKS }, (_, i) => (
                      <span key={i} className="spark" style={{ "--a": `${(360 / SPARKS) * i}deg` } as CSSProperties}>
                        <Sprite name="sparkle" width={8} height={8} scale={1} fallback={<span className="spark-fallback" />} />
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          </div>
        ));
      })}
    </div>
  );
}
