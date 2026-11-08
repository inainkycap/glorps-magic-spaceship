import { useProgress } from "../hooks/useProgress";
import Sprite from "./Sprite";

/** Zorps balance for every HUD. No cap, so it simply grows; never negative. */
export default function ZorpsCounter() {
  const { zorps } = useProgress();
  return (
    <span className="zorps-counter" role="status" aria-label={`${zorps} Zorps`}>
      <Sprite name="zorps" width={16} height={16} fallback={<span className="zorps-fallback" aria-hidden="true">Z</span>} />
      <span className="zorps-value" aria-hidden="true">
        {zorps.toLocaleString("en-US")}
      </span>
    </span>
  );
}

/** Inline "12 Zorps" with the coin icon, for prices in bubbles and buttons. */
export function ZorpsPrice({ amount }: { amount: number }) {
  return (
    <span className="zorps-price">
      <Sprite name="zorps" width={16} height={16} scale={1} fallback={<span className="zorps-fallback small">Z</span>} />
      {amount.toLocaleString("en-US")}
    </span>
  );
}
