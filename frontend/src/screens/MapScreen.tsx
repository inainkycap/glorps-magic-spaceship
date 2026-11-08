import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { listSpecies } from "../api";
import EraTimeline, { type TimePreview } from "../components/EraTimeline";
import ApiStatus from "../components/ApiStatus";
import Status from "../components/Status";
import TravelAnimation from "../components/TravelAnimation";
import { buildEraScale } from "../game/time";
import { travelCost } from "../game/zorps";
import ZorpsCounter from "../components/ZorpsCounter";
import { HOME, isPlace, samePlace } from "../geo";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";
import GlorpMarker from "../map/GlorpMarker";
import PinLayer from "../map/PinLayer";
import TravelBubble from "../map/TravelBubble";
import WorldMap, { type FocusRequest } from "../map/WorldMap";
import type { Place, SpeciesSummary } from "../types";

interface Trip {
  from: Place;
  to: Place;
  speciesId: string;
}

const placeOf = (s: SpeciesSummary): Place => ({ lat: s.lat, lon: s.lon, era_year: s.era_year });

/** Keep Glorp off the very top/bottom rows of the map, where it's hard to see. */
const MAX_HOVER_LAT = 80;


export default function MapScreen() {
  const state = useAsync("species", listSpecies);
  const { progress, glorp, zorps, setGlorp, spendZorps } = useProgress();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripEra, setTripEra] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  const all = state.status === "ok" ? state.data : [];
  // Until the backend adds lat/lon/era_year (contract 2026-11-07), skip species without them.
  const species = all.filter((s) => isPlace(placeOf(s)));
  const missing = all.length - species.length;
  const selected = species.find((s) => s.id === selectedId) ?? null;

  const currentEra = trip ? (tripEra ?? trip.from.era_year) : glorp.era_year;

  // Timeline arrow: the trip in progress, else the open bubble, else the hovered pin.
  const hovered = species.find((s) => s.id === hoveredId) ?? null;
  const preview: TimePreview | null = trip
    ? { from: trip.from.era_year, to: trip.to.era_year, targetId: trip.speciesId, mode: "travel" }
    : selected
      ? { from: glorp.era_year, to: selected.era_year, targetId: selected.id, mode: "selected" }
      : hovered
        ? { from: glorp.era_year, to: hovered.era_year, targetId: hovered.id, mode: "hover" }
        : null;

  /** Open the travel bubble for a species (pin or timeline marker). */
  const select = (s: SpeciesSummary, bringIntoView = false) => {
    if (trip) return;
    setSelectedId(s.id);
    if (bringIntoView) setFocus((f) => ({ lon: s.lon, lat: s.lat, seq: (f?.seq ?? 0) + 1 }));
  };

  const confirmTravel = () => {
    if (!selected || trip) return;
    const to = placeOf(selected);
    setSelectedId(null);
    if (samePlace(glorp, to)) {
      navigate(`/explore/${selected.id}`);
      return;
    }
    if (!spendZorps(travelCost(glorp, to))) return; // the bubble already disables Travel
    setTrip({ from: glorp, to, speciesId: selected.id });
  };

  const onMapClick = (lon: number, lat: number) => {
    if (trip) return;
    if (selectedId) {
      setSelectedId(null); // first click outside just closes the bubble
      return;
    }
    setGlorp({ lon, lat: Math.max(-MAX_HOVER_LAT, Math.min(MAX_HOVER_LAT, lat)), era_year: glorp.era_year });
  };

  const arrive = () => {
    if (!trip) return;
    setGlorp(trip.to);
    setTrip(null);
    setTripEra(null);
    navigate(`/explore/${trip.speciesId}`);
  };

  // Timeline: oldest species to the present (+ padding), linear or log; recomputed when species load.
  const eraKey = species.map((s) => s.era_year).join(",");
  const scale = useMemo(
    () => buildEraScale([...species.map((s) => s.era_year), glorp.era_year, HOME.era_year]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eraKey, glorp.era_year],
  );

  return (
    <div className="map-screen">
      <WorldMap
        initialCenter={glorp}
        home={glorp}
        era={currentEra}
        interactive={trip === null}
        onMapClick={onMapClick}
        focus={focus}
      >
        <PinLayer
          species={species}
          currentEra={currentEra}
          saved={progress.saved}
          selectedId={selectedId}
          disabled={trip !== null}
          onPick={(s) => select(s)}
          onHover={setHoveredId}
        />
        {trip ? (
          <TravelAnimation from={trip.from} to={trip.to} onEraChange={setTripEra} onDone={arrive} />
        ) : (
          <GlorpMarker at={glorp} />
        )}
        {selected && !trip && (
          <TravelBubble
            species={selected}
            fromYear={glorp.era_year}
            cost={travelCost(glorp, placeOf(selected))}
            zorps={zorps}
            here={samePlace(glorp, placeOf(selected))}
            onTravel={confirmTravel}
            onCancel={() => setSelectedId(null)}
          />
        )}
      </WorldMap>

      <header className="map-hud">
        <span className="brand">Glorp's Magic Spaceship</span>
        <span className="map-hint">Click a pin to travel · click the map to hover · drag to pan</span>
        <div className="hud-right">
          <ApiStatus />
          <ZorpsCounter />
          <Link className="px-button w-s" to="/sanctuary">
            Sanctuary
          </Link>
        </div>
      </header>

      {(state.status !== "ok" || missing > 0) && (
        <div className="map-status">
          <Status state={state} />
          {missing > 0 && (
            <p className="error">
              {missing} species have no lat/lon/era_year yet, so they're hidden from the map.
            </p>
          )}
        </div>
      )}

      <EraTimeline
        current={currentEra}
        scale={scale}
        preview={preview}
        disabled={trip !== null}
        onPick={(id) => {
          const s = species.find((x) => x.id === id);
          if (s) select(s, true);
        }}
        markers={species.map((s) => ({ id: s.id, year: s.era_year, label: s.name }))}
      />
    </div>
  );
}
