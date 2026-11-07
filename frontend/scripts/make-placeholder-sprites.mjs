// Generates the placeholder UI sprites in public/sprites/.
// Real art replaces these files one by one (same name, size and frame count):
// see ART_TODO.md. Re-running this script OVERWRITES public/sprites/*.png,
// so pass the names you want regenerated once real art has landed:
//   npm run sprites:placeholders                 # all
//   npm run sprites:placeholders -- pin arrow-left

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
const arrow = (dir) =>
  icon((c) => {
    for (let i = 0; i < 6; i++) {
      const x = dir < 0 ? 3 + i : 12 - i;
      c.rect(x, 7 - i, 1, i * 2 + 2, C.ink);
    }
    c.rect(dir < 0 ? 8 : 3, 6, 5, 4, C.ink);
  });

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
if (want("timeline-glorp"))
  save(
    "timeline-glorp",
    [0, -1].map((dy) => {
      const c = canvas(16, 16);
      c.rect(6, 4 + dy, 4, 4, C.mint);
      c.rect(6, 5 + dy, 1, 1, C.eye);
      c.rect(9, 5 + dy, 1, 1, C.eye);
      c.rect(2, 8 + dy, 12, 3, C.hull);
      c.rect(4, 11 + dy, 8, 1, C.hullShadow);
      c.rect(4, 9 + dy, 1, 1, C.light);
      c.rect(11, 9 + dy, 1, 1, C.light);
      return c.outline();
    }),
  );
if (want("timeline-species"))
  save("timeline-species", [
    (() => {
      const c = canvas(8, 8);
      for (let i = 0; i < 3; i++) c.rect(3 - i, 1 + i, 2 + i * 2, 1, C.sand), c.rect(3 - i, 6 - i, 2 + i * 2, 1, C.sand);
      return c.outline();
    })(),
  ]);
if (want("arrow-left")) save("arrow-left", [arrow(-1)]);
if (want("arrow-right")) save("arrow-right", [arrow(1)]);
if (want("icon-plus")) save("icon-plus", [icon((c) => (c.rect(6, 2, 4, 12, C.ink), c.rect(2, 6, 12, 4, C.ink)))]);
if (want("icon-minus")) save("icon-minus", [icon((c) => c.rect(2, 6, 12, 4, C.ink))]);
if (want("icon-recenter"))
  save("icon-recenter", [
    icon((c) => {
      c.disc(7.5, 7.5, 6, C.ink);
      c.disc(7.5, 7.5, 4, [0, 0, 0, 0]);
      c.rect(6, 6, 4, 4, C.ink);
    }),
  ]);
if (want("icon-time"))
  save("icon-time", [
    icon((c) => {
      c.rect(3, 1, 10, 2, C.ink);
      c.rect(3, 13, 10, 2, C.ink);
      for (let i = 0; i < 5; i++) {
        c.rect(4 + i, 3 + i, 8 - i * 2, 1, i < 2 ? C.sand : C.ink);
        c.rect(4 + i, 12 - i, 8 - i * 2, 1, i < 3 ? C.sand : C.ink);
      }
    }),
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
