import Sprite from "../components/Sprite";
import { formatYear } from "../geo";
import type { SpeciesSummary } from "../types";
import { useMapView } from "./MapViewContext";

/**
 * Species pins in screen space (constant size at any zoom). A pin appears on
 * every visible copy of the wrapping world.
 *
 * Layout note: the positioned element is a zero-size anchor at the pin tip;
 * the <button> hangs off it with plain offsets and NO transform, so nothing
 * (e.g. a :active press style) can move it out from under the pointer
 * mid-click. That was the v1 "pin jumps and travel doesn't start" bug.
 */
export default function PinLayer({
  species,
  currentEra,
  saved,
  selectedId,
  disabled,
  onPick,
  onHover,
}: {
  species: SpeciesSummary[];
  currentEra: number;
  saved: string[];
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
        const inEra = s.era_year === currentEra;
        return view.screenXs(s.lon).map((x, k) => (
          <div key={`${s.id}:${k}`} className="pin-anchor" style={{ left: x, top: y }}>
            <button
              className={`pin ${inEra ? "in-era" : "other-era"} ${isSaved ? "saved" : ""} ${s.id === selectedId ? "selected" : ""}`}
              aria-expanded={s.id === selectedId}
              onClick={() => onPick(s)}
              onPointerEnter={() => onHover(s.id)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(s.id)}
              onBlur={() => onHover(null)}
              disabled={disabled}
              aria-label={`Travel to ${s.name}, ${s.location}, ${formatYear(s.era_year)}${isSaved ? " (saved)" : ""}`}
            >
              <span className="pin-label" aria-hidden="true">
                {s.name}
                <span className="pin-year"> · {formatYear(s.era_year)}</span>
              </span>
              <Sprite
                name={isSaved ? "pin-saved" : "pin"}
                width={16}
                height={24}
                className="pin-sprite"
                fallback={<span className="pin-fallback" />}
              />
            </button>
          </div>
        ));
      })}
    </div>
  );
}
