import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { listSpecies } from "../api";
import EraTimeline from "../components/EraTimeline";
import Status from "../components/Status";
import TravelAnimation from "../components/TravelAnimation";
import { HOME, isPlace, samePlace } from "../geo";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";
import GlorpMarker from "../map/GlorpMarker";
import PinLayer from "../map/PinLayer";
import WorldMap from "../map/WorldMap";
import type { Place, SpeciesSummary } from "../types";

interface Trip {
  from: Place;
  to: Place;
  /** Where to go on arrival; null for a pure time jump from the timeline. */
  speciesId: string | null;
}

const placeOf = (s: SpeciesSummary): Place => ({ lat: s.lat, lon: s.lon, era_year: s.era_year });

/** Keep Glorp off the very top/bottom rows of the map, where it's hard to see. */
const MAX_HOVER_LAT = 80;

/** Timeline range: all given years, padded out to whole centuries. */
function eraRange(years: number[]): [number, number] {
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return [Math.floor((lo - 50) / 100) * 100, Math.ceil((hi + 50) / 100) * 100];
}

export default function MapScreen() {
  const state = useAsync("species", listSpecies);
  const { progress, glorp, setGlorp } = useProgress();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripEra, setTripEra] = useState<number | null>(null);
  const [targetEra, setTargetEra] = useState<number | null>(null);

  const all = state.status === "ok" ? state.data : [];
  // Until the backend adds lat/lon/era_year (contract 2026-11-07), skip species without them.
  const species = all.filter((s) => isPlace(placeOf(s)));
  const missing = all.length - species.length;

  const currentEra = trip ? (tripEra ?? trip.from.era_year) : glorp.era_year;
  // The era we're heading to: the trip's destination while travelling, else the
  // era picked with Further back / Forward (default: where Glorp already is).
  const target = trip ? trip.to.era_year : (targetEra ?? glorp.era_year);
  const eras = [...new Set(species.map((s) => s.era_year))].sort((a, b) => a - b);
  const earlier = eras.filter((e) => e < target).at(-1);
  const later = eras.find((e) => e > target);

  const travelTo = (s: SpeciesSummary) => {
    if (trip) return;
    const to = placeOf(s);
    if (samePlace(glorp, to)) {
      navigate(`/explore/${s.id}`);
      return;
    }
    setTrip({ from: glorp, to, speciesId: s.id });
  };

  const timeTravel = () => {
    if (trip || target === glorp.era_year) return;
    setTrip({ from: glorp, to: { ...glorp, era_year: target }, speciesId: null });
  };

  const hoverTo = (lon: number, lat: number) => {
    if (trip) return;
    setGlorp({ lon, lat: Math.max(-MAX_HOVER_LAT, Math.min(MAX_HOVER_LAT, lat)), era_year: glorp.era_year });
  };

  const arrive = () => {
    if (!trip) return;
    setGlorp(trip.to);
    setTrip(null);
    setTripEra(null);
    setTargetEra(null);
    if (trip.speciesId) navigate(`/explore/${trip.speciesId}`);
  };

  const range = eraRange([...eras, glorp.era_year, HOME.era_year, target]);

  return (
    <div className="map-screen">
      <WorldMap
        initialCenter={glorp}
        home={glorp}
        era={currentEra}
        interactive={trip === null}
        onMapClick={hoverTo}
      >
        <PinLayer
          species={species}
          currentEra={currentEra}
          saved={progress.saved}
          disabled={trip !== null}
          onPick={travelTo}
        />
        {trip ? (
          <TravelAnimation from={trip.from} to={trip.to} onEraChange={setTripEra} onDone={arrive} />
        ) : (
          <GlorpMarker at={glorp} />
        )}
      </WorldMap>

      <header className="map-hud">
        <span className="brand">Glorp's Magic Spaceship</span>
        <span className="map-hint">Click a pin to travel · click the map to hover · drag to pan</span>
        <Link className="px-button" to="/sanctuary">
          Sanctuary
        </Link>
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
        target={target}
        range={range}
        busy={trip !== null}
        onBack={earlier !== undefined ? () => setTargetEra(earlier) : null}
        onForward={later !== undefined ? () => setTargetEra(later) : null}
        onTravel={timeTravel}
        markers={species.map((s) => ({
          id: s.id,
          year: s.era_year,
          label: s.name,
          saved: progress.saved.includes(s.id),
        }))}
      />
    </div>
  );
}
