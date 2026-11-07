import { useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router";
import { getSpecies } from "../api";
import GlorpSprite from "../components/GlorpSprite";
import Sprite from "../components/Sprite";
import Status from "../components/Status";
import ArrivalBubble from "../explore/ArrivalBubble";
import FieldGuide from "../explore/FieldGuide";
import ScanBubble from "../explore/ScanBubble";
import { needKeysOf, revealsOf } from "../game/needs";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";
import type { Hotspot, NeedKey } from "../types";

interface ActiveScan {
  hotspot: Hotspot;
  firstScan: boolean;
  newNeeds: NeedKey[];
  knownNeeds: NeedKey[];
}

const spriteUrl = (name: string) => `${import.meta.env.BASE_URL}sprites/${name}.png`;

export default function Explore() {
  const { speciesId = "" } = useParams();
  const state = useAsync(speciesId, () => getSpecies(speciesId));
  const { scannedFor, discoveredFor, markScanned, discoverNeed } = useProgress();
  const [scan, setScan] = useState<ActiveScan | null>(null);
  const [arrivalOpen, setArrivalOpen] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  if (state.status !== "ok") return <Status state={state} />;
  const species = state.data;
  const scanned = scannedFor(species.id);
  const discovered = discoveredFor(species.id);
  const dna = species.hotspots.filter((h) => h.dna && scanned.includes(h.id)).length;
  const dnaLeft = Math.max(0, species.dna_required - dna);
  const needKeys = needKeysOf(species.needs);
  const showArrival = arrivalOpen && !!species.intro?.trim();

  const scanHotspot = (h: Hotspot) => {
    const firstScan = !scanned.includes(h.id);
    markScanned(species.id, h.id);
    // Only announce needs the species actually has content for.
    const reveals = revealsOf(h).filter((k) => species.needs?.[k]);
    const newNeeds = reveals.filter((k) => discoverNeed(species.id, k)); // records each new one
    const knownNeeds = reveals.filter((k) => !newNeeds.includes(k));
    setArrivalOpen(false);
    setScan({ hotspot: h, firstScan, newNeeds, knownNeeds });
  };

  const closeScan = () => {
    const id = scan?.hotspot.id;
    setScan(null);
    // Return focus to the hotspot that was scanned.
    if (id) document.querySelector<HTMLElement>(`[data-hotspot="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  };

  const openGuide = () => {
    setScan(null);
    setArrivalOpen(false);
    setGuideOpen(true);
  };

  // Background: per-species pixel art, over a plain gradient if the file is missing.
  const sceneStyle = { "--scene-bg": `url("${spriteUrl(`bg-explore-${species.id}`)}")` } as CSSProperties;

  return (
    <section className="explore">
      <header className="explore-head">
        <div>
          <h1>
            {species.location}, {species.era}
          </h1>
          <p className="explore-stats">
            DNA {dna}/{species.dna_required} · Scanned {scanned.length}/{species.hotspots.length}
            {needKeys.length > 0 && ` · Needs ${needKeys.filter((k) => discovered.includes(k)).length}/${needKeys.length}`}
          </p>
        </div>
        <div className="explore-actions">
          <button className="px-button w-m" onClick={openGuide}>
            <Sprite name="field-guide-icon" width={16} height={16} scale={1} fallback={null} /> Field guide
          </button>
          {/* Fixed-width slot: the hint and the button swap without shifting anything. */}
          <div className="lab-slot">
            {dnaLeft === 0 ? (
              <Link className="px-button primary w-l" to={`/lab/${species.id}`}>
                Go to DNA Lab
              </Link>
            ) : (
              <p className="muted lab-hint">
                Find {dnaLeft} more DNA {dnaLeft === 1 ? "fragment" : "fragments"} to open the DNA Lab
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="scene" style={sceneStyle}>
        {species.hotspots.map((h) => {
          const done = scanned.includes(h.id);
          return (
            <button
              key={h.id}
              data-hotspot={h.id}
              className={`hotspot ${done ? "scanned" : ""} ${scan?.hotspot.id === h.id ? "active" : ""}`}
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
              onClick={() => scanHotspot(h)}
              aria-label={`Scan: ${h.label}${done ? " (scanned)" : ""}`}
              title={h.label}
            >
              <Sprite
                name={`hotspot-${h.sprite}`}
                width={16}
                height={16}
                fallback={<span className="hotspot-fallback">{h.dna ? "DNA" : "?"}</span>}
              />
            </button>
          );
        })}

        <div className={`scene-glorp ${showArrival ? "talking" : ""}`} aria-hidden="true">
          <GlorpSprite size={64} variant={showArrival ? "talk" : "idle"} />
        </div>

        {showArrival && (
          <ArrivalBubble
            intro={species.intro!}
            onLearnMore={openGuide}
            onClose={() => setArrivalOpen(false)}
          />
        )}

        {scan && (
          <>
            {/* Blocks the other hotspots; the click itself is handled by ScanBubble (any click closes). */}
            <div className="scene-dim" aria-hidden="true" />
            <ScanBubble
              hotspot={scan.hotspot}
              firstScan={scan.firstScan}
              newNeeds={scan.newNeeds}
              knownNeeds={scan.knownNeeds}
              onClose={closeScan}
            />
          </>
        )}
      </div>

      {guideOpen && <FieldGuide species={species} discovered={discovered} onClose={() => setGuideOpen(false)} />}
    </section>
  );
}
