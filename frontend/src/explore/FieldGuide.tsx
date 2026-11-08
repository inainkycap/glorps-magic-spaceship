import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import Sprite from "../components/Sprite";
import { formatNeed, NEED_LABEL, needKeysOf } from "../game/needs";
import type { Habitat, NeedKey, Species, SpeciesFacts } from "../types";

const FACT_LABELS: [keyof SpeciesFacts, string][] = [
  ["height", "Height"],
  ["weight", "Weight"],
  ["diet", "Diet"],
  ["lifespan", "Lifespan"],
  ["extinct_year", "Extinct"],
  ["cause", "Cause"],
];

const HABITAT_LABELS: [keyof Habitat, string][] = [
  ["biome", "Biome"],
  ["climate", "Climate"],
  ["elevation", "Elevation"],
];

/** A value worth showing: a non-blank string or a number. */
const hasText = (v: unknown) => (typeof v === "string" && v.trim() !== "") || typeof v === "number";

/** Label/value rows for whichever keys are present. */
function Rows<T extends object>({ data, labels }: { data: T | undefined; labels: [keyof T, string][] }) {
  const rows = labels.filter(([k]) => hasText(data?.[k]));
  if (!data || rows.length === 0) return null;
  return (
    <dl className="guide-rows">
      {rows.map(([k, label]) => (
        <div key={String(k)} className="guide-row">
          <dt>{label}</dt>
          <dd>{String(data[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="guide-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/**
 * Field guide card for a species: Overview (intro, description, facts),
 * Habitat, Ideal conditions (needs; undiscovered ones show "???"), Sources.
 * Every part is optional: missing content is simply left out. Escape or the
 * close button closes it, and focus returns to whatever opened it.
 */
export default function FieldGuide({
  species,
  discovered,
  onClose,
}: {
  species: Species;
  discovered: NeedKey[];
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className="guide-backdrop" onClick={onClose}>
      <div
        className="field-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="guide-head">
          <Sprite name="field-guide-icon" width={16} height={16} fallback={null} />
          <div>
            <h2 id={titleId}>Field guide: {species.name}</h2>
            <p className="guide-sci">{species.scientific_name}</p>
          </div>
          <button ref={closeRef} className="px-button icon guide-close" onClick={onClose} aria-label="Close field guide">
            X
          </button>
        </header>

        <FieldGuideBody species={species} discovered={discovered} />
      </div>
    </div>
  );
}

/**
 * The field guide's content (Overview, Habitat, Ideal conditions, Sources), without
 * the dialog: used by the Explore field guide and the encyclopedia page.
 */
export function FieldGuideBody({ species, discovered }: { species: Species; discovered: NeedKey[] }) {
  const needKeys = needKeysOf(species.needs);
  const found = needKeys.filter((k) => discovered.includes(k)).length;
  const sources = (species.sources ?? []).filter((s) => hasText(s.url));
  const hasIntro = hasText(species.intro);
  const hasDescription = hasText(species.description);
  const hasOverview = hasIntro || hasDescription || FACT_LABELS.some(([k]) => hasText(species.facts?.[k]));
  const hasHabitat = HABITAT_LABELS.some(([k]) => hasText(species.habitat?.[k]));
  const empty = !hasOverview && !hasHabitat && needKeys.length === 0 && sources.length === 0;


  return (
    <div className="guide-body">
      {empty && <p className="guide-empty">No field notes yet. Glorp is still writing them!</p>}

      {hasOverview && (
        <Section title="Overview">
          {hasIntro && <p className="guide-intro">“{species.intro}”</p>}
          {hasDescription && <p>{species.description}</p>}
          <Rows data={species.facts} labels={FACT_LABELS} />
        </Section>
      )}

      {hasHabitat && (
        <Section title="Habitat">
          <Rows data={species.habitat} labels={HABITAT_LABELS} />
        </Section>
      )}

      {needKeys.length > 0 && (
        <Section title={`Ideal conditions (${found}/${needKeys.length} discovered)`}>
          <ul className="guide-needs">
            {needKeys.map((k) => {
              const need = species.needs![k]!;
              const known = discovered.includes(k);
              return (
                <li key={k} className={`guide-need ${known ? "known" : "unknown"}`}>
                  <Sprite name={`need-${k}`} width={16} height={16} fallback={<span className="need-fallback" />} />
                  <div>
                    <p className="need-head">
                      <span className="need-label">{NEED_LABEL[k]}</span>
                      <span className="need-value">{known ? (formatNeed(need) ?? "?") : "???"}</span>
                    </p>
                    <p className="need-why">
                      {known ? (need.why ?? "") : "Scan hotspots in this world to discover it."}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {sources.length > 0 && (
        <Section title="Sources">
          <ul className="guide-sources">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
