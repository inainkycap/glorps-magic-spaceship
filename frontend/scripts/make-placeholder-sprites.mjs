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
function glorp({ dy = 0, lightsOn = 0, flame = 0 }) {
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
  c.rect(15, y0 + 9, 2, 1, C.mintDark);
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
if (want("fuel-icon"))
  save("fuel-icon", [
    icon((c) => {
      // jerrycan
      c.rect(4, 1, 5, 1, C.thruster);
      c.rect(4, 2, 1, 2, C.thruster);
      c.rect(8, 2, 1, 2, C.thruster);
      c.rect(10, 2, 3, 2, C.hullShadow); // spout
      c.rect(3, 4, 10, 11, C.thruster);
      c.rect(4, 5, 8, 1, C.ink); // highlight
      c.rect(5, 8, 6, 1, C.thrusterDark);
      c.rect(5, 11, 6, 1, C.thrusterDark);
    }),
  ]);
if (want("fuel-gauge"))
  save("fuel-gauge", [
    (() => {
      // 48×10 frame; the 44×6 window at (2,2) stays transparent for the CSS fill
      const c = canvas(48, 10);
      c.rect(0, 0, 48, 10, C.outline);
      c.rect(1, 1, 46, 8, C.ink);
      c.rect(2, 2, 44, 6, [0, 0, 0, 0]);
      for (const k of [1, 2, 3]) c.rect(2 + Math.round((44 * k) / 4), 2, 1, 2, C.outline); // quarter ticks
      return c;
    })(),
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
