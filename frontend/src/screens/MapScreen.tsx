import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { listSpecies } from "../api";
import worldMap from "../assets/world-map.png";
import EraTimeline from "../components/EraTimeline";
import GlorpSprite from "../components/GlorpSprite";
import Status from "../components/Status";
import TravelAnimation from "../components/TravelAnimation";
import { HOME, formatYear, isPlace, project, samePlace } from "../geo";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";
import type { Place, SpeciesSummary } from "../types";

interface Trip {
  from: Place;
  to: Place;
  speciesId: string;
}

const placeOf = (s: SpeciesSummary): Place => ({ lat: s.lat, lon: s.lon, era_year: s.era_year });

/** Timeline range: every species era, Glorp's era and home, padded to whole centuries. */
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

  const all = state.status === "ok" ? state.data : [];
  // Until the backend adds lat/lon/era_year (contract 2026-11-07), skip species without them.
  const species = all.filter((s) => isPlace(placeOf(s)));
  const missing = all.length - species.length;

  const travelTo = (s: SpeciesSummary) => {
    if (trip) return;
    const to = placeOf(s);
    if (samePlace(glorp, to)) {
      navigate(`/explore/${s.id}`);
      return;
    }
    setTrip({ from: glorp, to, speciesId: s.id });
  };

  const arrive = () => {
    if (!trip) return;
    setGlorp(trip.to);
    navigate(`/explore/${trip.speciesId}`);
  };

  const glorpAt = project(glorp.lat, glorp.lon);
  const range = eraRange([...species.map((s) => s.era_year), glorp.era_year, HOME.era_year]);

  return (
    <div className="map-screen">
      <header className="map-hud">
        <span className="brand">Glorp's Magic Spaceship</span>
        <Link to="/sanctuary">Sanctuary ▶</Link>
      </header>

      <div className="map-stage">
        <div className="map-box">
          <img className="map-img" src={worldMap} alt="World map" draggable={false} />

          {species.map((s) => {
            const p = project(s.lat, s.lon);
            const saved = progress.saved.includes(s.id);
            return (
              <button
                key={s.id}
                className={`pin ${saved ? "saved" : ""}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={() => travelTo(s)}
                disabled={trip !== null}
                aria-label={`Travel to ${s.name}, ${s.location}, ${formatYear(s.era_year)}`}
              >
                <span className="pin-head" aria-hidden="true" />
                <span className="pin-label">
                  {s.name}
                  <span className="muted"> · {formatYear(s.era_year)}</span>
                </span>
              </button>
            );
          })}

          {trip ? (
            <TravelAnimation
              from={trip.from}
              to={trip.to}
              onEraChange={setTripEra}
              onDone={arrive}
            />
          ) : (
            <div className="map-glorp" style={{ left: `${glorpAt.x}%`, top: `${glorpAt.y}%` }}>
              <GlorpSprite size={48} />
            </div>
          )}
        </div>

        <div className="map-status">
          <Status state={state} />
          {missing > 0 && (
            <p className="error">
              {missing} species have no lat/lon/era_year yet, so they're hidden from the map.
            </p>
          )}
        </div>
      </div>

      <EraTimeline
        current={trip ? (tripEra ?? trip.from.era_year) : glorp.era_year}
        range={range}
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
