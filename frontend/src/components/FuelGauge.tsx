import { FUEL_MAX, isLowFuel } from "../game/fuel";
import { useProgress } from "../hooks/useProgress";
import Sprite from "./Sprite";

/** Gauge window inside fuel-gauge.png (48×10 source px, drawn at 2×): 2px border all round. */
const WINDOW_PX = (48 - 4) * 2;

/** HUD fuel gauge. Fixed width, so changing numbers never shift the layout. */
export default function FuelGauge() {
  const { fuel } = useProgress();
  const low = isLowFuel(fuel);
  return (
    <div
      className={`fuel-gauge ${low ? "low" : ""}`}
      role="meter"
      aria-label="Fuel"
      aria-valuemin={0}
      aria-valuemax={FUEL_MAX}
      aria-valuenow={fuel}
      aria-valuetext={`${fuel} of ${FUEL_MAX}${low ? ", low" : ""}`}
    >
      <Sprite name="fuel-icon" width={16} height={16} fallback={<span aria-hidden="true">⛽</span>} />
      <span className="fuel-bar">
        <span className="fuel-fill" style={{ width: (WINDOW_PX * fuel) / FUEL_MAX }} />
        <Sprite name="fuel-gauge" width={48} height={10} className="fuel-frame" fallback={<span className="fuel-frame fuel-frame-fallback" />} />
      </span>
      <span className="fuel-value" aria-hidden="true">
        {fuel}
      </span>
    </div>
  );
}
