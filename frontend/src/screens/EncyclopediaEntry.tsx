import { Link, useParams } from "react-router";
import { getWiki, wikiTitleOf } from "../api";
import SpeciesPortrait from "../components/SpeciesPortrait";
import Status from "../components/Status";
import { FieldGuideBody } from "../explore/FieldGuide";
import { completionOf, isRevealed, isUnlocked, pctText } from "../game/encyclopedia";
import { formatYear } from "../geo";
import { useAsync } from "../hooks/useAsync";
import { useProgress } from "../hooks/useProgress";
import { useSpeciesData } from "../hooks/useSpeciesData";
import type { Species } from "../types";

/** "From Wikipedia": shown only if GET /api/wiki/{title} answers; otherwise nothing at all. */
function WikiSection({ species }: { species: Species }) {
  const title = wikiTitleOf(species.sources);
  const wiki = useAsync(`wiki:${title ?? ""}`, () => (title ? getWiki(title) : Promise.resolve(null)));
  if (wiki.status !== "ok" || !wiki.data) return null;
  const w = wiki.data;
  return (
    <section className="guide-section wiki-section" aria-label="From Wikipedia">
      <h3>From Wikipedia</h3>
      <div className="wiki-body">
        {w.image_url && <img className="wiki-image" src={w.image_url} alt={w.title} loading="lazy" referrerPolicy="no-referrer" />}
        <p>{w.summary}</p>
      </div>
      <p className="wiki-attribution">
        From the Wikipedia article “{w.title}”, licensed under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY-SA 4.0
        </a>
        .{" "}
        {w.url && (
          <a href={w.url} target="_blank" rel="noopener noreferrer">
            Read more on Wikipedia
          </a>
        )}
      </p>
    </section>
  );
}

/** One species' encyclopedia page: completion checklist + the field guide + Wikipedia. */
export default function EncyclopediaEntry() {
  const { speciesId = "" } = useParams();
  const data = useSpeciesData();
  const { progress, unlock, discoveredFor } = useProgress();

  if (data.status !== "ok") return <Status state={data} />;
  const species = data.data.byId[speciesId];
  const back = (
    <Link className="px-button" to="/encyclopedia">
      Back to the encyclopedia
    </Link>
  );
  if (!species || !isUnlocked(speciesId, data.data.waves, unlock.wave) || !isRevealed(speciesId, progress)) {
    return (
      <section className="ency-entry">
        {back}
        <h1>???</h1>
        <p className="muted">{species ? "Glorp hasn't visited this species yet. Travel to its signal on the map." : "No such species."}</p>
      </section>
    );
  }

  const completion = completionOf(species, progress);
  return (
    <section className="ency-entry">
      <div className="ency-entry-top">{back}</div>
      <header className="ency-entry-head">
        <span className="ency-frame big">
          <SpeciesPortrait id={species.id} scale={4} />
        </span>
        <div>
          <h1>{species.name}</h1>
          <p className="guide-sci">{species.scientific_name}</p>
          <p className="muted small">
            {species.location} · {formatYear(species.era_year)}
          </p>
        </div>
      </header>

      <div className="ency-entry-cols">
        <aside className="ency-checklist" aria-label={`Completion: ${pctText(completion.fraction)}`}>
          <h2>
            {pctText(completion.fraction)} <span className="small muted">complete</span>
          </h2>
          <span className="bar" aria-hidden="true">
            <span className="bar-fill" style={{ width: pctText(completion.fraction) }} />
          </span>
          <ul>
            {completion.items.map((it) => (
              <li key={it.key} className={it.done >= 1 ? "done" : it.done > 0 ? "partial" : ""}>
                <span className="check" aria-hidden="true">
                  {it.done >= 1 ? "✓" : ""}
                </span>
                <span>{it.label}</span>
                {it.count && <span className="check-count">{it.count}</span>}
                <span className="visually-hidden">{it.done >= 1 ? "done" : "not done yet"}</span>
              </li>
            ))}
          </ul>
        </aside>
        <div className="ency-guide field-guide inline">
          <FieldGuideBody species={species} discovered={discoveredFor(species.id)} />
          <WikiSection species={species} />
        </div>
      </div>
    </section>
  );
}
