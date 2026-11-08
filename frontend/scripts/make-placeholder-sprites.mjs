// Generates the placeholder UI sprites in public/sprites/.
// Real art replaces these files one by one (same name, size and frame count):
// see ART_TODO.md. Re-running this script OVERWRITES public/sprites/*.png,
// so pass the names you want regenerated once real art has landed:
//   npm run sprites:placeholders                 # all
//   npm run sprites:placeholders -- pin era-marker

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeRgbaPng } from "./lib/png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/sprites");

const hex = (h, a = 255) => [...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), a];
const C = {
  outline: hex("#1d2230"),
  mint: hex("#9fd3b4"),
  mintDark: hex("#6fa88a"),
  eye: hex("#1d2230"),
  glass: hex("#bcd8e6", 150),
  hull: hex("#d8d3c4"),
  hullShadow: hex("#a8a394"),
  light: hex("#e2c991"),
  lightOff: hex("#8c7d6a"),
  thruster: hex("#d99a9a"),
  thrusterDark: hex("#a86b72"),
  era: hex("#f4d67a"), // high-contrast era markers
  eraHi: hex("#fff4d0"),
  flame: hex("#e2c991"),
  sand: hex("#e2c991"),
  sandDark: hex("#bfa47e"),
  panel: hex("#3a4258"),
  panelHi: hex("#4d5670"),
  panelLo: hex("#2b3144"),
  ink: hex("#ece6d6"),
};

/** One frame: a w×h RGBA canvas with tiny drawing helpers. */
function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const c = {
    w,
    h,
    data,
    set(x, y, col) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      data.set(col, (y * w + x) * 4);
    },
    rect(x, y, rw, rh, col) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) c.set(x + i, y + j, col);
    },
    disc(cx, cy, r, col) {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) c.set(x, y, col);
    },
    alpha: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]),
    /** 1px outline around every opaque pixel. */
    outline(col = C.outline) {
      const add = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (!c.alpha(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.alpha(x + dx, y + dy) > 200))
            add.push([x, y]);
      for (const [x, y] of add) c.set(x, y, col);
      return c;
    },
  };
  return c;
}

/** Lay frames out as a horizontal strip and write the PNG. */
function save(name, frames) {
  const { w, h } = frames[0];
  const strip = new Uint8Array(w * frames.length * h * 4);
  frames.forEach((f, k) => {
    for (let y = 0; y < h; y++)
      strip.set(f.data.subarray(y * w * 4, (y + 1) * w * 4), (y * w * frames.length + k * w) * 4);
  });
  writeFileSync(`${outDir}/${name}.png`, encodeRgbaPng(w * frames.length, h, strip));
  console.log(`  ${name}.png  ${w}×${h} × ${frames.length} frame(s)`);
}

// --- Glorp: 32×32 frames ----------------------------------------------------
function glorp({ dy = 0, lightsOn = 0, flame = 0, mouthOpen = false }) {
  const c = canvas(32, 32);
  const y0 = 4 + dy;
  // dome glass behind Glorp
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 32; x++) if ((x - 15.5) ** 2 / 64 + (y - 11.5) ** 2 / 121 <= 1) c.set(x, y0 + y, C.glass);
  // Glorp: antenna, head, eyes, mouth
  c.rect(15, y0 + 1, 2, 3, C.mintDark);
  c.rect(14, y0, 4, 1, C.mint);
  c.rect(12, y0 + 4, 8, 7, C.mint);
  c.rect(11, y0 + 5, 10, 5, C.mint);
  c.rect(13, y0 + 6, 2, 2, C.eye);
  c.rect(17, y0 + 6, 2, 2, C.eye);
  if (mouthOpen) c.rect(14, y0 + 8, 4, 2, C.eye);
  else c.rect(15, y0 + 9, 2, 1, C.mintDark);
  // hull
  c.rect(8, y0 + 12, 16, 1, C.hull);
  c.rect(4, y0 + 13, 24, 3, C.hull);
  c.rect(6, y0 + 16, 20, 1, C.hullShadow);
  c.rect(9, y0 + 17, 14, 1, C.hullShadow);
  [6, 11, 16, 21, 25].forEach((x, i) => c.rect(x, y0 + 14, 2, 1, (i + lightsOn) % 2 ? C.light : C.lightOff));
  // thrusters + flame
  c.rect(10, y0 + 18, 2, 2, C.thruster);
  c.rect(20, y0 + 18, 2, 2, C.thruster);
  if (flame) {
    c.rect(10, y0 + 20, 2, flame, C.flame);
    c.rect(20, y0 + 20, 2, flame, C.flame);
  }
  return c.outline();
}

// --- map pin: 16×24, tip at bottom centre ------------------------------------
function pin(fill, inner) {
  const c = canvas(16, 24);
  c.disc(7.5, 7, 6, fill);
  for (let y = 12; y < 22; y++) {
    const half = Math.max(0, Math.round((22 - y) * 0.45));
    c.rect(8 - half - 1, y, half * 2 + 2, 1, fill);
  }
  c.disc(7.5, 7, 2.2, inner);
  return c.outline();
}

// --- tiny icons: 16×16 -------------------------------------------------------
function icon(draw) {
  const c = canvas(16, 16);
  draw(c);
  return c.outline();
}
/** 16×16 diamond: filled, or a ring (`hole` > 0) for the outlined variant. */
function diamond({ fill, hole = 0, highlight = null }) {
  const c = canvas(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d <= 7 && d > hole) c.set(x, y, fill);
    }
  if (highlight) c.rect(5, 5, 2, 2, highlight);
  return c.outline();
}

/** Rounded 1px-outlined panel, for 9-slice frames. */
function panel(w, h, fill, edge = C.outline) {
  const c = canvas(w, h);
  c.rect(1, 0, w - 2, h, edge);
  c.rect(0, 1, w, h - 2, edge);
  c.rect(1, 1, w - 2, h - 2, fill);
  return c;
}

mkdirSync(outDir, { recursive: true });
const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);
console.log(`writing ${outDir}`);

if (want("glorp-idle"))
  save("glorp-idle", [0, 1, 2, 3].map((k) => glorp({ dy: [0, -1, -1, 0][k], lightsOn: k % 2 })));
if (want("glorp-fly"))
  save("glorp-fly", [0, 1, 2, 3].map((k) => glorp({ dy: [0, 1, 0, -1][k], lightsOn: 1, flame: [2, 4, 3, 5][k] })));
if (want("pin")) save("pin", [pin(C.sand, C.outline)]);
if (want("pin-saved")) save("pin-saved", [pin(C.mint, C.outline)]);
/** Small timeline saucer; `ghost` = pale, see-through version for the preview target. */
function miniGlorp(dy, ghost = false) {
  const c = canvas(16, 16);
  const tint = (col) => (ghost ? [...col.slice(0, 3).map((v) => Math.round(v + (255 - v) * 0.5)), 170] : col);
  c.rect(6, 4 + dy, 4, 4, tint(C.mint));
  c.rect(6, 5 + dy, 1, 1, tint(C.eye));
  c.rect(9, 5 + dy, 1, 1, tint(C.eye));
  c.rect(2, 8 + dy, 12, 3, tint(C.hull));
  c.rect(4, 11 + dy, 8, 1, tint(C.hullShadow));
  c.rect(4, 9 + dy, 1, 1, tint(C.light));
  c.rect(11, 9 + dy, 1, 1, tint(C.light));
  return c.outline(ghost ? hex("#1d2230", 120) : C.outline);
}
if (want("timeline-glorp")) save("timeline-glorp", [0, -1].map((dy) => miniGlorp(dy)));
if (want("timeline-glorp-ghost")) save("timeline-glorp-ghost", [miniGlorp(0, true)]);
if (want("timeline-arrowhead"))
  save("timeline-arrowhead", [
    (() => {
      // 8×8, points RIGHT (flipped by CSS for trips into the past)
      const c = canvas(8, 8);
      for (let i = 0; i < 4; i++) c.rect(1 + i, i + 1, 1, 6 - i * 2, C.mint);
      return c.outline();
    })(),
  ]);
if (want("era-marker")) save("era-marker", [diamond({ fill: C.era, hole: 3.5 })]);
if (want("era-marker-current")) save("era-marker-current", [diamond({ fill: C.era, highlight: C.eraHi })]);
if (want("icon-plus")) save("icon-plus", [icon((c) => (c.rect(6, 2, 4, 12, C.ink), c.rect(2, 6, 12, 4, C.ink)))]);
if (want("icon-minus")) save("icon-minus", [icon((c) => c.rect(2, 6, 12, 4, C.ink))]);
if (want("btn_recenter_glorp"))
  save("btn_recenter_glorp", [
    icon((c) => {
      // Glorp's face: antenna, round head, eyes, smile
      c.rect(7, 0, 2, 1, C.mint);
      c.rect(7, 1, 2, 3, C.mintDark);
      c.rect(4, 4, 8, 10, C.mint);
      c.rect(3, 5, 10, 8, C.mint);
      c.rect(5, 7, 2, 3, C.eye);
      c.rect(9, 7, 2, 3, C.eye);
      c.rect(5, 7, 1, 1, C.ink);
      c.rect(9, 7, 1, 1, C.ink);
      c.rect(6, 11, 4, 1, C.mintDark);
    }),
  ]);
if (want("zorps"))
  save("zorps", [
    icon((c) => {
      // Zorps coin: a round gold coin with a "Z" and a shine
      c.disc(7.5, 7.5, 6.5, C.sand);
      c.disc(7.5, 7.5, 5, hex("#c9b48c"));
      c.rect(5, 4, 6, 1, C.outline); // Z top
      c.rect(9, 5, 1, 1, C.outline);
      c.rect(8, 6, 1, 1, C.outline);
      c.rect(7, 7, 1, 1, C.outline);
      c.rect(6, 8, 1, 1, C.outline);
      c.rect(5, 9, 1, 1, C.outline);
      c.rect(5, 10, 6, 1, C.outline); // Z bottom
      c.rect(4, 3, 2, 1, C.ink); // shine
    }),
  ]);
if (want("bubble"))
  save("bubble", [
    (() => {
      // 16×16, 9-slice with 6px corners (see .travel-bubble in index.css)
      const c = panel(16, 16, C.ink);
      c.rect(1, 14, 14, 1, C.hull); // soft inner bottom edge
      return c;
    })(),
  ]);
if (want("bubble-tail"))
  save("bubble-tail", [
    (() => {
      // 16×8, points down; its top row overlaps the bubble's bottom edge
      const c = canvas(16, 8);
      for (let y = 0; y < 7; y++) {
        const half = 7 - y;
        c.rect(8 - half, y, half * 2, 1, C.outline);
        if (half > 1) c.rect(9 - half, y, half * 2 - 2, 1, C.ink);
      }
      return c;
    })(),
  ]);
if (want("button"))
  save("button", [
    (() => {
      // 12×12, 9-slice with 4px corners (see .px-button in index.css)
      const c = canvas(12, 12);
      c.rect(1, 0, 10, 12, C.outline);
      c.rect(0, 1, 12, 10, C.outline);
      c.rect(1, 1, 10, 10, C.panel);
      c.rect(1, 1, 10, 1, C.panelHi);
      c.rect(1, 9, 10, 2, C.panelLo);
      return c;
    })(),
  ]);

// --- Explore -------------------------------------------------------------------

const X = {
  brown: hex("#8c6a4a"),
  brownDark: hex("#5e4632"),
  cream: hex("#efe6cf"),
  grey: hex("#a3a6b5"),
  greyDark: hex("#6e7180"),
  pink: hex("#d99a9a"),
  leaf: hex("#6f8a5a"),
  leafDark: hex("#4f6a44"),
  water: hex("#7aa0c0"),
  red: hex("#c7655f"),
  bone: hex("#e8e2d0"),
  parchment: hex("#efe8d6"),
  parchmentDark: hex("#d3c8ae"),
  frame: hex("#8c7d6a"),
};

if (want("glorp-talk"))
  save("glorp-talk", [0, 1].map((k) => glorp({ dy: k ? -1 : 0, lightsOn: k, mouthOpen: k === 1 })));

/** Hotspot icons, 16×16, drawn at 2× in the Explore scene and scan bubble. */
const HOTSPOTS = {
  egg: (c) => {
    c.rect(2, 11, 12, 3, X.brown); // nest
    c.rect(3, 10, 2, 1, X.brownDark), c.rect(11, 10, 2, 1, X.brownDark);
    c.disc(7.5, 7.5, 3.6, X.cream);
    c.rect(6, 5, 1, 2, [255, 255, 255, 255]);
  },
  feather: (c) => {
    for (let i = 0; i < 10; i++) c.rect(3 + i, 12 - i, 2, 2, i % 3 ? X.grey : X.greyDark);
    c.rect(2, 13, 2, 2, X.greyDark); // quill
  },
  rat: (c) => {
    c.rect(4, 8, 7, 4, X.greyDark);
    c.rect(10, 7, 3, 4, X.greyDark); // head
    c.rect(11, 6, 1, 1, X.pink); // ear
    c.rect(13, 9, 1, 1, X.pink); // nose
    c.rect(11, 8, 1, 1, C.outline); // eye
    c.rect(1, 11, 3, 1, X.pink), c.rect(0, 10, 1, 1, X.pink); // tail
  },
  stump: (c) => {
    c.rect(4, 6, 8, 8, X.brown);
    c.rect(3, 13, 10, 2, X.brownDark);
    c.rect(4, 5, 8, 2, X.cream);
    c.rect(6, 5, 4, 1, X.brown); // ring
  },
  sailor: (c) => {
    c.rect(3, 3, 10, 2, C.outline); // hat brim
    c.rect(5, 1, 6, 2, C.outline); // hat
    c.rect(5, 5, 6, 5, X.cream); // face
    c.rect(6, 7, 1, 1, C.outline), c.rect(9, 7, 1, 1, C.outline);
    c.rect(4, 10, 8, 5, hex("#4d5f80")); // coat
  },
  bones: (c) => {
    for (let i = 0; i < 10; i++) c.rect(3 + i, 3 + i, 2, 2, X.bone), c.rect(11 - i, 3 + i, 2, 2, X.bone);
    for (const [x, y] of [[2, 2], [12, 2], [2, 12], [12, 12]]) c.rect(x, y, 3, 3, X.bone);
  },
  flock: (c) => {
    for (const [x, y] of [[2, 3], [8, 2], [5, 8], [11, 7], [7, 12]]) {
      c.rect(x, y, 1, 1, C.outline), c.rect(x + 1, y + 1, 1, 1, C.outline), c.rect(x + 2, y, 1, 1, C.outline);
    }
  },
  barrel: (c) => {
    c.rect(4, 2, 8, 12, X.brown);
    c.rect(3, 4, 10, 8, X.brown);
    c.rect(3, 5, 10, 1, X.brownDark), c.rect(3, 10, 10, 1, X.brownDark);
    c.rect(6, 2, 4, 1, X.grey); // pigeon peeking out
  },
  pole: (c) => {
    c.rect(7, 1, 2, 14, X.brownDark);
    c.rect(3, 3, 10, 2, X.brownDark);
    c.rect(3, 2, 1, 1, X.grey), c.rect(12, 2, 1, 1, X.grey); // insulators
    c.rect(0, 6, 7, 1, C.outline), c.rect(9, 6, 7, 1, C.outline); // wires
  },
  shore: (c) => {
    // sea-level shoreline: waves over sand (reveals oxygen + pressure)
    c.rect(1, 3, 14, 7, X.water);
    for (const x of [2, 7, 12]) c.rect(x, 4, 3, 1, X.cream), c.rect(x + 1, 3, 1, 1, X.cream); // wave crests
    c.rect(4, 7, 2, 1, X.cream), c.rect(9, 7, 2, 1, X.cream);
    c.rect(1, 10, 14, 4, hex("#d6c39d")); // sand
    c.rect(3, 12, 1, 1, X.brown), c.rect(10, 11, 1, 1, X.brown);
  },
};
for (const [name, draw] of Object.entries(HOTSPOTS)) {
  if (want(`hotspot-${name}`)) save(`hotspot-${name}`, [icon(draw)]);
}

/** Need icons for the field guide's "Ideal conditions", 16×16 at 2×. */
const NEEDS = {
  terrain: (c) => {
    c.rect(7, 9, 2, 5, X.brownDark);
    c.disc(7.5, 6.5, 5, X.leaf);
    c.rect(1, 14, 14, 1, X.leafDark);
  },
  temperature: (c) => {
    c.rect(6, 1, 4, 10, X.cream);
    c.rect(7, 4, 2, 8, X.red);
    c.disc(7.5, 12, 3, X.red);
  },
  humidity: (c) => {
    for (let y = 2; y < 15; y++) {
      const half = y < 8 ? Math.ceil((y - 1) / 2) : Math.round(5 - (y - 9) ** 2 / 6);
      if (half > 0) c.rect(8 - half, y, half * 2, 1, X.water);
    }
    c.rect(6, 9, 1, 2, [255, 255, 255, 255]);
  },
  oxygen: (c) => {
    c.disc(5, 9, 4, X.water);
    c.disc(5, 9, 2, [0, 0, 0, 0]);
    c.disc(12, 5, 2.5, X.water);
  },
  pressure: (c) => {
    c.disc(7.5, 8.5, 6, X.cream);
    c.rect(7, 4, 2, 5, C.outline); // needle
    c.rect(7, 8, 2, 2, X.red);
  },
};
for (const [name, draw] of Object.entries(NEEDS)) {
  if (want(`need-${name}`)) save(`need-${name}`, [icon(draw)]);
}

if (want("field-guide-icon"))
  save("field-guide-icon", [
    icon((c) => {
      c.rect(2, 2, 12, 12, X.brown); // cover
      c.rect(3, 12, 11, 2, X.cream); // page edges
      c.rect(4, 4, 8, 1, X.cream); // title
      c.rect(10, 1, 2, 6, C.mint); // bookmark
    }),
  ]);
if (want("field-guide-frame"))
  save("field-guide-frame", [
    (() => {
      // 16×16, 9-slice with 6px corners (see .field-guide in index.css)
      const c = panel(16, 16, X.parchment, X.frame);
      c.rect(2, 2, 12, 1, X.parchmentDark);
      c.rect(2, 13, 12, 1, X.parchmentDark);
      c.rect(2, 2, 1, 12, X.parchmentDark);
      c.rect(13, 2, 1, 12, X.parchmentDark);
      return c;
    })(),
  ]);

// --- Explore backgrounds, 320×180 (drawn stretched to the 16:9 scene) ----------

/** Deterministic speckle, so regenerating gives the same picture. */
function speckle(c, x0, y0, w, h, col, every, seed) {
  let s = seed;
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      if (s % every === 0) c.set(x, y, col);
    }
}
function bands(c, y0, colors, h) {
  colors.forEach((col, i) => c.rect(0, y0 + i * h, c.w, h, col));
}
function tree(c, x, groundY, r, leaf, leafDark, trunk) {
  c.rect(x - 2, groundY - r * 2, 4, r * 2, trunk);
  c.disc(x, groundY - r * 2, r, leafDark);
  c.disc(x - 2, groundY - r * 2 - 2, r - 2, leaf);
}

if (want("bg-explore-dodo"))
  save("bg-explore-dodo", [
    (() => {
      const c = canvas(320, 180);
      bands(c, 0, ["#8fa9bd", "#9bb3c3", "#a8bcc8", "#b6c6cd"].map((h) => hex(h)), 18); // sky
      c.rect(0, 72, 320, 14, hex("#5f7f99")); // sea
      c.rect(0, 74, 320, 1, hex("#86a2b4"));
      c.rect(0, 86, 320, 8, hex("#d6c39d")); // beach
      c.rect(0, 94, 320, 86, hex("#7f9471")); // forest floor
      speckle(c, 0, 94, 320, 86, hex("#6f8a6a"), 7, 11);
      speckle(c, 0, 94, 320, 86, hex("#90a986"), 13, 29);
      for (const [x, r] of [[14, 16], [40, 20], [66, 14], [262, 18], [292, 22], [318, 15]])
        tree(c, x, 104, r, hex("#5f7a52"), hex("#4b6243"), hex("#5e4632"));
      speckle(c, 0, 50, 90, 50, hex("#c7655f"), 97, 5); // fruit
      return c;
    })(),
  ]);
if (want("bg-explore-passenger_pigeon"))
  save("bg-explore-passenger_pigeon", [
    (() => {
      const c = canvas(320, 180);
      bands(c, 0, ["#a3b8c8", "#adc0cc", "#b8c8cf", "#c4d0d2"].map((h) => hex(h)), 24); // sky (reaches below the lowest hill)
      for (let x = 0; x < 320; x++) {
        const hill = Math.round(70 + 8 * Math.sin(x / 23) + 5 * Math.sin(x / 9));
        c.rect(x, hill, 1, 90 - hill + 10, hex("#7d9486")); // distant hills
      }
      c.rect(0, 96, 320, 84, hex("#7b8c5a")); // ground
      speckle(c, 0, 96, 320, 84, hex("#6c7d4f"), 6, 3);
      speckle(c, 0, 96, 320, 84, hex("#8f9f6a"), 11, 17);
      for (const [x, r] of [[120, 20], [158, 24], [196, 18], [236, 22], [276, 20], [312, 24]])
        tree(c, x, 108, r, hex("#6f8c5a"), hex("#56704a"), hex("#8a8d84"));
      for (const x of [16, 38, 62, 84]) {
        c.rect(x, 104, 8, 6, hex("#8c6a4a")); // stumps: cleared land
        c.rect(x, 103, 8, 1, hex("#d6c39d"));
      }
      return c;
    })(),
  ]);

// --- Sanctuary (Glorp's home planet) ---------------------------------------------

const P = {
  sky0: hex("#1f1a33"),
  sky1: hex("#2a2440"),
  sky2: hex("#3a2f55"),
  ground: hex("#5b4a6e"),
  groundLo: hex("#4a3c5c"),
  groundHi: hex("#6f5c84"),
  crater: hex("#3f3352"),
  teal: hex("#5f9a92"),
  tealDark: hex("#3f6f6a"),
  moon: hex("#d8d3c4"),
  moon2: hex("#d99a9a"),
  star: hex("#ece6d6"),
  glass: hex("#dcebf5", 150),
  glassHi: hex("#ffffff", 200),
  rim: hex("#8f9ab0"),
  rimDark: hex("#5d6680"),
};

if (want("planet-terrain"))
  save("planet-terrain", [
    (() => {
      // 320×180: alien sky with two moons, purple rocky plain, craters, teal crystal plants
      const c = canvas(320, 180);
      bands(c, 0, [P.sky0, P.sky1, P.sky2], 24);
      speckle(c, 0, 0, 320, 64, P.star, 97, 7);
      c.disc(262, 22, 12, P.moon);
      c.disc(258, 19, 3, hex("#bfb9a8"));
      c.disc(52, 34, 6, P.moon2);
      for (let x = 0; x < 320; x++) {
        const ridge = Math.round(64 + 6 * Math.sin(x / 17) + 4 * Math.sin(x / 7 + 1));
        c.rect(x, ridge, 1, 72 - ridge + 6, P.groundLo); // distant ridge
      }
      c.rect(0, 72, 320, 108, P.ground);
      speckle(c, 0, 72, 320, 108, P.groundHi, 9, 21);
      speckle(c, 0, 72, 320, 108, P.groundLo, 7, 33);
      for (const [x, y, r] of [[40, 150, 10], [150, 166, 7], [292, 140, 12], [210, 98, 6], [110, 104, 5]]) {
        c.disc(x, y, r, P.crater);
        c.disc(x - 1, y - 1, r - 2, P.groundLo);
      }
      for (const [x, y] of [[8, 120], [128, 132], [306, 104], [190, 150], [66, 92]]) {
        c.rect(x, y - 8, 2, 8, P.teal); // crystal sprouts
        c.rect(x + 3, y - 5, 2, 5, P.tealDark);
        c.rect(x - 3, y - 4, 2, 4, P.tealDark);
      }
      return c;
    })(),
  ]);

if (want("dome-glass"))
  save("dome-glass", [
    (() => {
      // 64×64: rim + highlights only; the interior stays transparent
      const c = canvas(64, 64);
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const d = Math.hypot(x - 31.5, y - 31.5);
          if (d > 31.5) continue;
          if (d > 30) c.set(x, y, P.rimDark);
          else if (d > 28.5) c.set(x, y, P.rim);
        }
      for (let i = 0; i < 14; i++) c.rect(12 + i, 14 - Math.round(i * 0.45), 2, 1, P.glassHi); // shine
      c.rect(14, 18, 2, 6, P.glass);
      c.rect(48, 44, 3, 2, P.glass);
      return c;
    })(),
  ]);

if (want("dome-site"))
  save("dome-site", [
    (() => {
      // 32×32: dashed foundation ring with a little flag
      const c = canvas(32, 32);
      for (let a = 0; a < 32; a++) {
        if (a % 4 >= 2) continue;
        const t = (a / 32) * Math.PI * 2;
        c.rect(Math.round(15.5 + Math.cos(t) * 13), Math.round(18 + Math.sin(t) * 9), 2, 2, X.cream);
      }
      c.rect(15, 4, 1, 14, X.cream); // pole
      c.rect(16, 4, 6, 4, C.mint); // flag
      return c.outline();
    })(),
  ]);

/** Interior ground (64×20) and plants (64×24) per terrain. */
const TERRAIN_ART = {
  forest: { ground: "#4f6a44", groundHi: "#5f7a52", plant: "#3f5a3a", plantHi: "#6f8a5a", trunk: "#5e4632", kind: "trees" },
  grassland: { ground: "#7c9a5a", groundHi: "#8fab6a", plant: "#9fbb72", plantHi: "#c2c98a", trunk: "#7c9a5a", kind: "grass" },
  wetland: { ground: "#4f7a78", groundHi: "#6b9aa0", plant: "#5f8a5a", plantHi: "#8faa6a", trunk: "#4f6a44", kind: "reeds" },
  tundra: { ground: "#c8ccc4", groundHi: "#e2e4dc", plant: "#8f9a8a", plantHi: "#aab2a2", trunk: "#6e7180", kind: "shrubs" },
};
for (const [t, a] of Object.entries(TERRAIN_ART)) {
  if (want(`dome-ground-${t}`)) {
    const c = canvas(64, 20);
    c.rect(0, 0, 64, 20, hex(a.ground));
    speckle(c, 0, 0, 64, 20, hex(a.groundHi), 5, t.length * 7);
    if (t === "wetland") for (const x of [6, 30, 48]) c.rect(x, 6, 10, 3, hex("#6b9ab4")); // pools
    save(`dome-ground-${t}`, [c]);
  }
  if (want(`dome-plants-${t}`)) {
    const c = canvas(64, 24);
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * 11;
      if (a.kind === "trees") {
        c.rect(x + 2, 14, 2, 10, hex(a.trunk));
        c.disc(x + 3, 10, 5, hex(a.plant));
        c.disc(x + 2, 9, 3, hex(a.plantHi));
      } else if (a.kind === "grass") {
        for (let k = 0; k < 4; k++) c.rect(x + k * 2, 18 - (k % 2) * 3, 1, 6 + (k % 2) * 3, hex(k % 2 ? a.plantHi : a.plant));
      } else if (a.kind === "reeds") {
        for (let k = 0; k < 3; k++) c.rect(x + k * 3, 8 + k * 2, 1, 16 - k * 2, hex(a.plant));
        c.rect(x + 3, 7, 2, 3, X.brown); // seed head
      } else {
        c.disc(x + 3, 21, 3, hex(a.plant));
        c.rect(x + 2, 19, 2, 1, hex(a.plantHi));
      }
    }
    save(`dome-plants-${t}`, [c]);
  }
}

if (want("control-panel"))
  save("control-panel", [
    (() => {
      // 16×16, 9-slice with 6px corners: dark metal with rivets
      const c = panel(16, 16, C.panel, C.outline);
      c.rect(2, 2, 12, 1, C.panelHi);
      c.rect(2, 13, 12, 1, C.panelLo);
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) c.rect(x, y, 1, 1, X.grey);
      return c;
    })(),
  ]);

if (want("dial-knob"))
  save("dial-knob", [
    icon((c) => {
      c.disc(7.5, 7.5, 6, C.sand);
      c.disc(7.5, 7.5, 4, hex("#c9b48c"));
      c.rect(7, 2, 2, 5, C.outline); // pointer
    }),
  ]);

const DISASTER_ART = {
  breach: (c) => {
    c.disc(7.5, 8.5, 6, P.glass);
    for (const [x, y] of [[7, 3], [8, 4], [7, 5], [6, 6], [7, 7], [8, 8], [9, 9], [8, 10], [7, 11]]) c.rect(x, y, 1, 1, C.outline); // crack
  },
  power: (c) => {
    for (const [x, y, w] of [[8, 1, 3], [7, 3, 3], [6, 5, 3], [5, 7, 6], [7, 9, 3], [6, 11, 3], [5, 13, 2]]) c.rect(x, y, w, 2, C.sand);
  },
  meteor: (c) => {
    c.disc(10, 10, 4, X.brown);
    c.rect(9, 8, 2, 2, X.brownDark);
    for (let i = 0; i < 6; i++) c.rect(1 + i, 1 + i, 2, 1, i < 3 ? C.sand : C.thruster); // trail
  },
  disease: (c) => {
    c.disc(7.5, 7.5, 4.5, C.mintDark);
    for (const [x, y] of [[7, 1], [7, 13], [1, 7], [13, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) c.rect(x, y, 2, 2, C.mint);
    c.rect(6, 6, 2, 2, C.outline);
  },
};
for (const [id, draw] of Object.entries(DISASTER_ART)) {
  if (want(`disaster-${id}`)) save(`disaster-${id}`, [icon(draw)]);
}

/** Residents: 16×16, 2-frame walk (feet alternate). */
function resident({ body, belly, beak, frame, tall }) {
  const c = canvas(16, 16);
  const top = tall ? 3 : 6;
  c.rect(4, top + 2, 8, 16 - top - 5, body); // body
  c.rect(9, top, 4, 4, body); // head
  c.rect(13, top + 1, 2, 2, beak); // beak
  c.rect(11, top + 1, 1, 1, C.outline); // eye
  c.rect(5, top + 5, 5, 16 - top - 9, belly);
  c.rect(frame ? 5 : 6, 13, 1, 2, beak); // feet
  c.rect(frame ? 9 : 8, 13, 1, 2, beak);
  return c.outline();
}
const RESIDENTS = {
  dodo: { body: hex("#9a958c"), belly: hex("#c8c2b4"), beak: hex("#d6c39d"), tall: true },
  passenger_pigeon: { body: hex("#7d8aa0"), belly: hex("#c98a7a"), beak: hex("#3a3a44"), tall: false },
};
for (const [id, look] of Object.entries(RESIDENTS)) {
  if (want(`resident-${id}`)) save(`resident-${id}`, [0, 1].map((frame) => resident({ ...look, frame })));
}

// --- DNA Lab --------------------------------------------------------------------

/** 5×7 pixel glyphs for the base tiles. */
const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
};
/** 16×16 rounded tile with a letter; colours match .base-fallback in index.css. */
function baseTile(letter, fill, ink, cracked = false) {
  const c = panel(16, 16, fill, C.outline);
  c.rect(1, 1, 14, 1, [255, 255, 255, 70]); // top highlight
  GLYPHS[letter].forEach((row, y) =>
    [...row].forEach((bit, x) => {
      if (bit === "1") c.rect(5 + x, 4 + y, 1, 1, ink);
    }),
  );
  if (cracked) for (const [x, y] of [[2, 12], [3, 13], [12, 2], [13, 3], [11, 13]]) c.set(x, y, C.outline);
  return c;
}
const BASE_TILES = {
  a: ["A", hex("#d99a9a")],
  t: ["T", hex("#e2c991")],
  c: ["C", hex("#9fd3b4")],
  g: ["G", hex("#8fb0d8")],
};
for (const [id, [letter, fill]] of Object.entries(BASE_TILES)) {
  if (want(`dna-base-${id}`)) save(`dna-base-${id}`, [baseTile(letter, fill, C.outline)]);
}
if (want("dna-base-degraded")) save("dna-base-degraded", [baseTile("?", hex("#6e7180"), C.ink, true)]);
