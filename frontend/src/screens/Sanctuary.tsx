import { Link } from "react-router";
import { listSpecies } from "../api";
import Status from "../components/Status";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";

export default function Sanctuary() {
  const state = useAsync("species", listSpecies);
  const { progress } = useProgress();

  if (state.status !== "ok")
    return (
      <section>
        <h1>Sanctuary</h1>
        <Status state={state} />
      </section>
    );

  const saved = state.data.filter((s) => progress.saved.includes(s.id));

  return (
    <section>
      <h1>Sanctuary</h1>
      {saved.length === 0 ? (
        <p className="muted">
          Nobody here yet. <Link to="/">Go save someone ▶</Link>
        </p>
      ) : (
        <ul className="card-list">
          {saved.map((s) => (
            <li key={s.id} className="card">
              <h2>{s.name}</h2>
              <p className="muted">
                <i>{s.scientific_name}</i> · from {s.location}, {s.era}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
