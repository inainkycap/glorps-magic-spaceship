import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import dodo from "../mocks/species/dodo.json";
import type { NeedKey, Species } from "../types";
import FieldGuide from "./FieldGuide";
import ScanBubble from "./ScanBubble";

/** A species with only the old required fields: no content at all. */
const bare: Species = {
  id: "bare",
  name: "Bare",
  scientific_name: "Nudus nudus",
  status: "extinct",
  era: "1700",
  location: "Nowhere",
  kind: "bird",
  lat: 0,
  lon: 0,
  era_year: 1700,
  hotspots: [{ id: "h", label: "Thing", sprite: "egg", x: 50, y: 50, fact: "A fact.", dna: false }],
  dna_required: 3,
};

const render = (s: Species, discovered: NeedKey[] = []) =>
  renderToStaticMarkup(<FieldGuide species={s} discovered={discovered} onClose={() => {}} />);

describe("FieldGuide with missing content", () => {
  it("renders an empty-state card for a species with no content fields", () => {
    const html = render(bare);
    expect(html).toContain("No field notes yet");
    expect(html).not.toContain("Ideal conditions");
    expect(html).not.toContain("Sources");
  });

  it("copes with partial needs and facts (no why, no unit, one-sided bounds)", () => {
    const html = render(
      { ...bare, facts: { diet: "Seeds" }, needs: { temperature: { min: 5 }, oxygen: {} } },
      ["temperature", "oxygen"],
    );
    expect(html).toContain("Seeds");
    expect(html).toContain("at least 5");
    expect(html).toContain("(2/2 discovered)");
    expect(html).not.toContain("No field notes yet");
  });

  it("hides undiscovered needs behind ??? and shows discovered ones", () => {
    const html = render(dodo as unknown as Species, ["terrain"]);
    expect(html).toContain("Forest floor with fallen fruit");
    expect(html).toContain("???");
    expect(html).not.toContain("~18 to ~30"); // temperature not discovered yet
    expect(html).toContain("(1/5 discovered)");
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Dodo"');
  });

  it("ignores blank strings and sources without a url", () => {
    const html = render({ ...bare, description: "", habitat: { biome: " " }, sources: [{ title: "x", url: "" }] });
    expect(html).toContain("No field notes yet");
  });
});

describe("ScanBubble", () => {
  it("shows DNA and discovery badges only when relevant", () => {
    const h = { ...bare.hotspots[0], dna: true };
    const first = renderToStaticMarkup(<ScanBubble hotspot={h} firstScan newNeeds={["humidity"]} knownNeeds={[]} onClose={() => {}} />);
    expect(first).toContain("DNA fragment found!");
    expect(first).toContain("New: ideal humidity discovered!");
    const plain = renderToStaticMarkup(
      <ScanBubble hotspot={bare.hotspots[0]} firstScan newNeeds={[]} knownNeeds={[]} onClose={() => {}} />,
    );
    expect(plain).not.toContain("DNA");
    expect(plain).not.toContain("discovered");
  });
});
