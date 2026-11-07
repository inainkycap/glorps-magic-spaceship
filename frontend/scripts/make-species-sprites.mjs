// Placeholder sprites for the species pack (backend PR "species pack"):
//   resident-<id>.png     16×16 × 2 frames (walk/hop cycle, facing right)
//   bg-explore-<id>.png   320×180 Explore background
//   hotspot-<sprite>.png  16×16 hotspot icons used by the new species files
// Same format and palette as scripts/make-placeholder-sprites.mjs (see ART_TODO.md),
// kept in a separate file so that script stays untouched. Real art can replace any of
// these files one by one. Re-running OVERWRITES the files it makes; pass names to
// regenerate only some:
//   node scripts/make-species-sprites.mjs                    # all
//   node scripts/make-species-sprites.mjs resident-quagga hotspot-fish

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeRgbaPng } from "./lib/png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/sprites");
mkdirSync(outDir, { recursive: true });

const hex = (h, a = 255) => [...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), a];
const OUTLINE = hex("#1d2230");
const K = {
  white: hex("#f4f1e8"),
  cream: hex("#efe6cf"),
  sand: hex("#e2c991"),
  sandDark: hex("#bfa47e"),
  brown: hex("#8c6a4a"),
  brownDark: hex("#5e4632"),
  grey: hex("#a3a6b5"),
  greyDark: hex("#6e7180"),
  stone: hex("#8a8c93"),
  stoneDark: hex("#62646c"),
  leaf: hex("#6f8a5a"),
  leafDark: hex("#4f6a44"),
  moss: hex("#7f9a5c"),
  water: hex("#7aa0c0"),
  waterDark: hex("#5a7f9f"),
  ice: hex("#d8e8f0"),
  pink: hex("#d99a9a"),
  red: hex("#c7655f"),
  orange: hex("#f0902c"),
  orangeHi: hex("#ffc066"),
  olive: hex("#5a5a3a"),
  parchment: hex("#efe8d6"),
  ink: hex("#2b3144"),
  mint: hex("#9fd3b4"),
};

/** One frame: a w×h RGBA canvas with tiny drawing helpers (as in make-placeholder-sprites). */
function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const c = {
    w,
    h,
    data,
    set(x, y, col) {
      x = Math.round(x), (y = Math.round(y));
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
    ellipse(cx, cy, rx, ry, col) {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) c.set(x, y, col);
    },
    line(x0, y0, x1, y1, col) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) c.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, col);
    },
    tri(x0, y0, x1, y1, x2, y2, col) {
      const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2));
      const minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
      const s = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const a = s(x0, y0, x1, y1, x, y), b = s(x1, y1, x2, y2, x, y), d = s(x2, y2, x0, y0, x, y);
          if ((a >= 0 && b >= 0 && d >= 0) || (a <= 0 && b <= 0 && d <= 0)) c.set(x, y, col);
        }
    },
    /** Blend a translucent colour over the existing pixels (mist, fog). */
    veil(x, y, rw, rh, [r, g, b], a) {
      for (let j = y; j < y + rh; j++)
        for (let i = x; i < x + rw; i++) {
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const o = (j * w + i) * 4;
          data[o] = Math.round(data[o] * (1 - a) + r * a);
          data[o + 1] = Math.round(data[o + 1] * (1 - a) + g * a);
          data[o + 2] = Math.round(data[o + 2] * (1 - a) + b * a);
        }
    },
    alpha: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]),
    /** 1px outline around every opaque pixel. */
    outline(col = OUTLINE) {
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

const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);
const icon = (draw) => {
  const c = canvas(16, 16);
  draw(c);
  return c.outline();
};

// --- hotspot icons (16×16) -----------------------------------------------------------
const HOTSPOTS = {
  hollow: (c) => {
    c.rect(4, 1, 8, 15, K.brown);
    c.rect(3, 12, 10, 4, K.brownDark);
    c.ellipse(8, 7, 2.2, 3.2, OUTLINE); // the hollow
    c.rect(7, 6, 1, 1, K.brownDark), c.rect(9, 9, 1, 1, K.brownDark); // stick insect peeking
    c.rect(4, 3, 1, 3, K.brownDark), c.rect(11, 9, 1, 3, K.brownDark); // bark
  },
  leaves: (c) => {
    c.line(2, 14, 12, 3, K.brownDark);
    for (const [x, y] of [[4, 10], [8, 6], [11, 9], [6, 4]]) c.ellipse(x, y, 2.6, 1.6, K.leaf);
    c.rect(10, 8, 2, 2, [0, 0, 0, 0]), c.rect(3, 9, 1, 2, [0, 0, 0, 0]); // bite marks
    c.rect(7, 5, 1, 1, K.leafDark), c.rect(4, 11, 1, 1, K.leafDark);
  },
  "stick-insect": (c) => {
    c.rect(2, 7, 11, 2, K.brownDark); // long body
    c.rect(12, 6, 2, 3, K.brownDark); // head
    c.line(14, 6, 15, 3, K.brownDark), c.line(13, 6, 13, 2, K.brownDark); // antennae
    for (const x of [4, 7, 10]) c.line(x, 9, x - 2, 13, K.brown), c.line(x, 7, x - 1, 3, K.brown); // legs
    c.rect(1, 7, 1, 1, K.brown);
  },
  pyramid: (c) => {
    c.rect(0, 12, 16, 4, K.water); // sea
    c.rect(1, 12, 3, 1, K.white), c.rect(11, 13, 3, 1, K.white);
    c.tri(5, 12, 11, 12, 8, 1, K.stone); // the spire
    c.tri(8, 1, 11, 12, 9, 12, K.stoneDark);
    c.rect(7, 4, 1, 1, K.leaf); // a single bush
  },
  grass: (c) => {
    for (const [x, hgt, col] of [[2, 7, K.sandDark], [4, 10, K.sand], [6, 8, K.leaf], [8, 11, K.sand], [10, 7, K.sandDark], [12, 9, K.leaf], [13, 6, K.sand]])
      c.line(x, 14, x + (x % 3) - 1, 14 - hgt, col);
    c.rect(1, 14, 14, 1, K.brown);
  },
  sun: (c) => {
    c.disc(7.5, 7.5, 4, K.sand);
    c.disc(6.5, 6.5, 2, K.orangeHi);
    for (const [x, y] of [[7, 0], [7, 14], [0, 7], [14, 7], [2, 2], [12, 2], [2, 12], [12, 12]]) c.rect(x, y, 2, 2, K.sand);
  },
  "cracked-earth": (c) => {
    c.rect(1, 3, 14, 11, K.sandDark);
    for (const [a, b, d, e] of [[3, 3, 6, 8], [6, 8, 4, 13], [6, 8, 11, 7], [11, 7, 13, 3], [11, 7, 12, 13]]) c.line(a, b, d, e, K.brownDark);
    c.rect(2, 5, 1, 1, K.sand), c.rect(9, 11, 2, 1, K.sand);
  },
  mountain: (c) => {
    c.tri(0, 14, 15, 14, 8, 2, K.stone);
    c.tri(8, 2, 15, 14, 10, 14, K.stoneDark);
    c.tri(6, 5, 10, 5, 8, 2, K.white); // snow cap
    c.rect(0, 14, 16, 1, K.leafDark);
  },
  hoofprints: (c) => {
    for (const [x, y] of [[1, 9], [9, 2]]) {
      c.rect(x, y, 5, 5, K.brownDark); // a round hoof print...
      c.rect(x + 1, y + 1, 3, 4, K.sandDark); // ...hollow in the middle
      c.rect(x + 2, y + 3, 1, 2, [0, 0, 0, 0]); // open at the back
      c.rect(x, y, 1, 1, [0, 0, 0, 0]), c.rect(x + 4, y, 1, 1, [0, 0, 0, 0]); // rounded front
    }
  },
  hide: (c) => {
    c.rect(2, 3, 12, 10, K.brown);
    c.rect(1, 5, 1, 6, K.brown), c.rect(14, 5, 1, 6, K.brown);
    for (const x of [2, 4, 6]) c.rect(x, 3, 1, 10, K.cream); // stripes fade out to plain brown
    c.rect(8, 4, 1, 7, K.sandDark);
  },
  fence: (c) => {
    for (const x of [2, 7, 12]) c.rect(x, 3, 2, 12, K.brown);
    c.rect(0, 6, 16, 1, K.greyDark), c.rect(0, 10, 16, 1, K.greyDark); // wire
    for (const x of [1, 5, 10, 15]) c.set(x, 5, K.greyDark), c.set(x, 9, K.greyDark); // barbs
  },
  puddle: (c) => {
    c.ellipse(8, 10, 7, 3.5, K.water);
    c.ellipse(8, 10, 4, 1.8, K.waterDark);
    c.rect(4, 9, 2, 1, K.white), c.rect(10, 11, 2, 1, K.white);
    c.line(13, 7, 14, 3, K.leaf), c.line(2, 8, 1, 4, K.leaf); // reeds
  },
  cloud: (c) => {
    c.disc(5, 9, 3.5, K.white);
    c.disc(9, 7, 4, K.white);
    c.disc(12, 10, 2.8, K.white);
    c.rect(3, 10, 11, 3, K.white);
    c.rect(4, 12, 9, 1, K.grey);
  },
  moss: (c) => {
    c.rect(1, 3, 14, 3, K.brown); // branch
    for (const x of [2, 5, 8, 11, 13]) c.rect(x, 5, 2, 4 + (x % 4), K.moss); // hanging moss
    c.rect(2, 2, 12, 2, K.moss);
    c.rect(6, 13, 1, 1, K.water), c.rect(12, 14, 1, 1, K.water); // drips
  },
  toad: (c) => {
    c.ellipse(8, 10, 6, 4, K.orange);
    c.disc(5, 6, 1.8, K.orange), c.disc(11, 6, 1.8, K.orange); // eye bumps
    c.rect(5, 6, 1, 1, OUTLINE), c.rect(11, 6, 1, 1, OUTLINE);
    c.rect(6, 8, 4, 1, K.orangeHi);
    c.rect(2, 13, 3, 1, K.orange), c.rect(11, 13, 3, 1, K.orange); // feet
  },
  "toad-spotted": (c) => {
    c.ellipse(8, 10, 6, 4, K.olive);
    c.disc(5, 6, 1.8, K.olive), c.disc(11, 6, 1.8, K.olive);
    c.rect(5, 6, 1, 1, OUTLINE), c.rect(11, 6, 1, 1, OUTLINE);
    for (const [x, y] of [[5, 9], [9, 8], [11, 11], [6, 12]]) c.rect(x, y, 2, 1, K.red), c.rect(x, y + 1, 2, 1, K.orangeHi);
    c.rect(2, 13, 3, 1, K.olive), c.rect(11, 13, 3, 1, K.olive);
  },
  spawn: (c) => {
    c.ellipse(8, 9, 7, 5, K.water);
    for (let i = 0; i < 6; i++) c.rect(2 + i * 2, 6 + (i % 2) * 2, 1, 1, OUTLINE), c.rect(3 + i * 2, 9 + (i % 2), 1, 1, OUTLINE);
    c.line(1, 8, 14, 11, hex("#a8c4d8")); // jelly string
  },
  cliff: (c) => {
    c.rect(2, 2, 9, 13, K.stone);
    c.rect(11, 6, 3, 9, K.stoneDark);
    c.rect(4, 5, 4, 1, K.stoneDark), c.rect(3, 9, 5, 1, K.stoneDark), c.rect(6, 12, 4, 1, K.stoneDark); // ledges
    c.rect(1, 14, 14, 1, K.leaf);
    c.rect(2, 1, 4, 1, K.leaf);
  },
  snowflake: (c) => {
    c.line(8, 1, 8, 14, K.ice), c.line(2, 4, 14, 11, K.ice), c.line(2, 11, 14, 4, K.ice);
    for (const [x, y] of [[8, 1], [8, 14], [2, 4], [14, 11], [2, 11], [14, 4]]) c.disc(x, y, 1, K.white);
    c.disc(8, 7.5, 1.5, K.white);
  },
  horns: (c) => {
    c.rect(6, 8, 4, 6, K.greyDark); // head, from the front
    c.rect(7, 14, 2, 1, K.grey); // muzzle
    c.set(6, 10, OUTLINE), c.set(9, 10, OUTLINE); // eyes
    for (const [sx, dir] of [[6, -1], [9, 1]]) // two thick horns sweeping up and outwards
      for (let i = 0; i < 7; i++) {
        const x = sx + dir * Math.round(i * 0.8), y = 7 - i;
        c.rect(x, y, 2, 2, i % 2 ? K.sandDark : K.brown);
      }
  },
  goat: (c) => {
    c.rect(3, 7, 8, 4, K.greyDark); // body
    c.rect(10, 4, 3, 4, K.greyDark); // head
    c.line(11, 4, 9, 1, K.brownDark), c.line(12, 4, 11, 1, K.brownDark); // little horns
    c.rect(13, 6, 1, 1, K.greyDark), c.rect(12, 5, 1, 1, OUTLINE);
    for (const x of [3, 5, 8, 10]) c.rect(x, 11, 1, 4, K.greyDark);
    c.rect(4, 9, 6, 1, K.grey);
  },
  vial: (c) => {
    c.rect(6, 1, 4, 2, K.grey); // cap
    c.rect(5, 3, 6, 11, K.ice);
    c.rect(6, 8, 4, 5, K.mint); // cells in liquid
    c.rect(7, 9, 1, 1, K.white), c.rect(8, 11, 1, 1, K.white);
    c.rect(4, 14, 8, 1, K.greyDark);
  },
  log: (c) => {
    c.rect(1, 6, 12, 7, K.brown);
    c.ellipse(13, 9.5, 2.5, 3.5, K.sandDark);
    c.ellipse(13, 9.5, 1.3, 2, OUTLINE); // hollow end
    c.rect(3, 8, 6, 1, K.brownDark), c.rect(4, 11, 5, 1, K.brownDark);
    c.rect(2, 5, 3, 1, K.moss);
  },
  fern: (c) => {
    c.line(8, 15, 8, 2, K.leafDark);
    for (let i = 0; i < 6; i++) {
      const y = 3 + i * 2, w = 2 + Math.min(i, 3);
      c.line(8, y, 8 - w, y + 1, K.leaf), c.line(8, y, 8 + w, y + 1, K.leaf);
    }
  },
  pawprints: (c) => {
    for (const [x, y] of [[1, 8], [8, 1]]) {
      c.rect(x + 1, y + 3, 4, 3, K.brownDark); // pad
      c.rect(x, y + 1, 1, 1, K.brownDark), c.rect(x + 2, y, 1, 1, K.brownDark); // four toes
      c.rect(x + 4, y, 1, 1, K.brownDark), c.rect(x + 6, y + 1, 1, 1, K.brownDark);
    }
  },
  fur: (c) => {
    for (let i = 0; i < 7; i++) c.line(3 + i * 1.6, 13, 2 + i * 1.6 + (i % 2), 3, i % 3 ? K.sandDark : K.brown);
    c.rect(7, 4, 1, 9, K.brownDark), c.rect(11, 5, 1, 8, K.brownDark); // stripes
  },
  poster: (c) => {
    c.rect(2, 1, 12, 14, K.parchment);
    c.rect(4, 3, 8, 1, K.ink), c.rect(5, 5, 6, 1, K.ink); // heading
    c.rect(4, 7, 8, 4, K.sandDark); // a tiger with stripes
    for (const x of [6, 8, 10]) c.rect(x, 7, 1, 4, K.brownDark);
    c.rect(5, 12, 6, 1, K.red); // "£1"
  },
  "egg-rock": (c) => {
    c.ellipse(8, 13, 7, 2.5, K.stone);
    c.ellipse(8, 8, 3.2, 4.5, K.cream);
    for (const [x, y] of [[7, 6], [9, 9], [6, 10]]) c.rect(x, y, 1, 1, K.brownDark); // speckles
    c.rect(7, 5, 1, 1, K.white);
  },
  fish: (c) => {
    c.ellipse(7, 8, 5, 2.6, K.grey);
    c.tri(11, 8, 15, 5, 15, 11, K.greyDark); // tail
    c.rect(3, 7, 1, 1, OUTLINE);
    c.rect(4, 9, 6, 1, K.white);
  },
  ship: (c) => {
    c.rect(2, 11, 12, 3, K.brownDark); // hull
    c.rect(1, 10, 14, 1, K.brown);
    c.rect(7, 1, 1, 10, K.brownDark); // mast
    c.tri(8, 2, 8, 9, 13, 9, hex("#d6cbb0")), c.tri(7, 3, 7, 9, 3, 9, hex("#c7bb9c")); // sails
    c.rect(0, 14, 16, 1, K.water);
  },
  kelp: (c) => {
    c.rect(0, 1, 16, 14, K.waterDark);
    for (const x of [3, 7, 11]) for (let y = 14; y > 2; y--) c.set(x + (y % 4 < 2 ? 0 : 1), y, K.olive);
    for (const [x, y] of [[4, 5], [8, 9], [12, 4]]) c.ellipse(x, y, 1.5, 1, K.moss);
  },
  "sea-cow": (c) => {
    c.rect(0, 9, 16, 6, K.water);
    c.ellipse(8, 9, 6.5, 3, hex("#5d5a55")); // back breaking the surface
    c.rect(4, 8, 2, 1, hex("#77736c")), c.rect(9, 7, 3, 1, hex("#77736c")); // bark-like skin
    c.tri(1, 9, 0, 6, 3, 8, hex("#5d5a55")); // tail fluke
    c.rect(2, 10, 12, 1, K.white); // splash line
  },
  tusk: (c) => {
    for (let i = 0; i < 12; i++) {
      const x = 2 + i, y = Math.round(13 - 9 * Math.sin((i / 12) * Math.PI * 0.8));
      c.rect(x, y, 2, 2, K.cream);
    }
    c.rect(1, 12, 3, 3, K.sandDark); // broken base
  },
  wind: (c) => {
    c.line(1, 4, 11, 4, K.ice), c.line(11, 4, 13, 2, K.ice);
    c.line(3, 8, 14, 8, K.white), c.line(14, 8, 15, 6, K.white);
    c.line(1, 12, 9, 12, K.ice), c.line(9, 12, 11, 14, K.ice);
  },
};
for (const [name, draw] of Object.entries(HOTSPOTS)) {
  if (want(`hotspot-${name}`)) save(`hotspot-${name}`, [icon(draw)]);
}

// --- residents (16×16, 2 frames, facing right) -----------------------------------------
/** Four legs that alternate between the two frames. */
function legs4(c, frame, xs, top, len, col) {
  xs.forEach((x, i) => {
    const dx = (i % 2 === 0) === (frame === 0) ? 0 : 1;
    c.rect(x + dx, top, 1, len, col);
  });
}
const RESIDENTS = {
  lord_howe_stick_insect: (c, f) => {
    const body = hex("#6a5240"), hi = hex("#8a6c52");
    c.rect(1, 9, 11, 2, body); // long glossy body
    c.rect(3, 9, 6, 1, hi);
    c.rect(11, 8, 3, 3, body); // head
    c.set(14, 7, body), c.set(15, 6, body); // antenna
    [3, 6, 9].forEach((x, i) => { // three legs on the near side, alternating
      const fwd = (i + f) % 2 ? 1 : -1;
      c.set(x, 11, body), c.set(x + fwd, 12, body), c.set(x + fwd, 13, body);
    });
    c.rect(9, 11, 2, 1, body); // the male's thick back leg
  },
  quagga: (c, f) => {
    const coat = hex("#9a7650"), dark = hex("#4a3a2a");
    c.rect(3, 6, 9, 5, coat); // body
    c.rect(10, 3, 3, 5, coat), c.rect(12, 4, 3, 3, coat); // neck + head
    c.rect(14, 5, 1, 2, dark); // muzzle
    c.rect(12, 4, 1, 1, OUTLINE); // eye
    for (const x of [9, 11, 13]) c.rect(x, 3, 1, 4, K.cream); // stripes on the front only
    c.rect(7, 6, 1, 3, K.cream);
    c.rect(10, 2, 3, 1, dark); // mane
    c.rect(2, 7, 1, 4, dark); // tail
    c.rect(4, 10, 7, 1, K.cream); // pale belly
    legs4(c, f, [4, 5, 9, 10], 11, 4, coat);
  },
  thylacine: (c, f) => {
    const coat = hex("#b88d5a"), dark = hex("#4a3a2a");
    c.rect(3, 7, 9, 4, coat);
    c.rect(11, 5, 3, 4, coat), c.rect(14, 7, 2, 2, coat); // head + snout
    c.rect(11, 4, 1, 1, coat), c.rect(13, 4, 1, 1, coat); // ears
    c.rect(12, 6, 1, 1, OUTLINE);
    for (const x of [3, 5, 7]) c.rect(x, 7, 1, 3, dark); // stripes on the back half
    c.line(0, 9, 3, 8, coat); // long stiff tail
    legs4(c, f, [4, 5, 9, 10], 11, 4, coat);
  },
  pyrenean_ibex: (c, f) => {
    const coat = hex("#8c7a62"), dark = hex("#4a3f33");
    c.rect(3, 7, 8, 4, coat);
    c.rect(10, 4, 3, 4, coat), c.rect(13, 5, 1, 2, coat); // head
    c.rect(11, 5, 1, 1, OUTLINE);
    c.line(11, 4, 8, 1, dark), c.line(8, 1, 6, 2, dark); // big curved horns
    c.line(12, 4, 10, 1, dark);
    c.rect(13, 7, 1, 2, dark); // beard
    c.rect(4, 9, 6, 1, hex("#b9a88c"));
    legs4(c, f, [3, 4, 9, 10], 11, 4, dark);
  },
  golden_toad: (c, f) => {
    const y = f ? -2 : 0; // hop
    c.ellipse(8, 11 + y, 5.5, 3.5, K.orange);
    c.disc(10, 7.5 + y, 1.6, K.orange), c.disc(6, 7.5 + y, 1.6, K.orange);
    c.rect(10, 7 + y, 1, 1, OUTLINE), c.rect(6, 7 + y, 1, 1, OUTLINE);
    c.rect(6, 9 + y, 4, 1, K.orangeHi);
    if (f) c.rect(2, 12, 2, 1, K.orange), c.rect(12, 12, 2, 1, K.orange); // legs stretched mid-hop
    else c.rect(3, 14, 3, 1, K.orange), c.rect(10, 14, 3, 1, K.orange);
  },
  great_auk: (c, f) => {
    const back = hex("#232a33");
    c.rect(5, 3, 6, 10, back);
    c.rect(9, 1, 4, 4, back); // head
    c.rect(13, 2, 2, 3, K.cream), c.rect(13, 3, 2, 1, OUTLINE); // big grooved beak
    c.rect(10, 2, 2, 1, K.white); // white eye patch
    c.rect(7, 6, 4, 7, K.white); // white belly
    c.rect(4, 6, 1, 5, back); // flipper
    c.rect(f ? 6 : 7, 13, 2, 2, K.greyDark), c.rect(f ? 9 : 8, 13, 2, 2, K.greyDark); // feet
  },
  stellers_sea_cow: (c, f) => {
    const skin = hex("#5d5a55"), hi = hex("#77736c");
    c.ellipse(8, 9, 6.5, 3.5, skin);
    c.rect(13, 8, 2, 3, skin); // head
    c.rect(14, 8, 1, 1, OUTLINE);
    c.rect(5, 7, 3, 1, hi), c.rect(9, 6, 2, 1, hi); // rough skin
    const t = f ? -2 : 2; // fluke beats up and down
    c.tri(2, 9, 0, 9 + t - 1, 0, 9 + t + 1, skin);
    c.rect(11, 11, 2, 2, skin); // flipper
  },
  woolly_mammoth: (c, f) => {
    const coat = hex("#6e4a32"), dark = hex("#4a3020");
    c.rect(2, 4, 9, 7, coat);
    c.rect(3, 3, 7, 1, coat); // hump
    c.rect(10, 3, 3, 5, coat); // head
    c.rect(12, 7, 2, 5, coat), c.rect(13, 11, 2, 2, coat); // trunk
    c.rect(11, 4, 1, 1, OUTLINE);
    c.line(12, 8, 15, 6, K.cream), c.set(15, 5, K.cream); // tusk
    for (const x of [3, 5, 7, 9]) c.rect(x, 10, 1, 2, dark); // shaggy fringe
    legs4(c, f, [3, 4, 8, 9], 11, 4, coat);
  },
};
for (const [id, draw] of Object.entries(RESIDENTS)) {
  if (!want(`resident-${id}`)) continue;
  save(`resident-${id}`, [0, 1].map((f) => {
    const c = canvas(16, 16);
    draw(c, f);
    return c.outline();
  }));
}

// --- Explore backgrounds (320×180) --------------------------------------------------------
function speckle(c, x0, y0, w, h, col, every, seed) {
  let s = seed;
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      if (s % every === 0) c.set(x, y, col);
    }
}
function sky(c, colors, h) {
  colors.forEach((col, i) => c.rect(0, i * h, c.w, h, hex(col)));
}
/** A ridge line: fill below `f(x)` down to `bottom`. */
function ridge(c, f, bottom, col) {
  for (let x = 0; x < c.w; x++) {
    const top = Math.round(f(x));
    c.rect(x, top, 1, bottom - top, col);
  }
}
function tree(c, x, groundY, r, leaf, leafDark, trunk) {
  c.rect(x - 2, groundY - r * 2, 4, r * 2, trunk);
  c.disc(x, groundY - r * 2, r, leafDark);
  c.disc(x - 2, groundY - r * 2 - 2, r - 2, leaf);
}
function bg(id, draw) {
  if (!want(`bg-explore-${id}`)) return;
  const c = canvas(320, 180);
  draw(c);
  save(`bg-explore-${id}`, [c]);
}

bg("lord_howe_stick_insect", (c) => {
  sky(c, ["#9fbfd0", "#a9c6d4", "#b5cdd8", "#c2d5dc"], 18);
  c.rect(0, 66, 320, 20, hex("#6a9ab0")); // lagoon
  c.rect(0, 68, 320, 1, hex("#93b8c8"));
  c.tri(286, 70, 302, 70, 294, 24, hex("#7d8288")); // Ball's Pyramid on the horizon
  ridge(c, (x) => 54 - 16 * Math.exp(-(((x - 60) / 26) ** 2)) - 10 * Math.exp(-(((x - 100) / 20) ** 2)), 70, hex("#5f7a62")); // Mt Gower & Lidgbird
  c.rect(0, 86, 320, 6, hex("#e0d2ae")); // beach
  c.rect(0, 92, 320, 88, hex("#6f8a5e")); // forest floor
  speckle(c, 0, 92, 320, 88, hex("#5f7a52"), 7, 3);
  speckle(c, 0, 92, 320, 88, hex("#8aa47a"), 13, 7);
  for (const [x, r] of [[12, 18], [44, 22], [74, 16], [250, 20], [282, 18], [312, 22]])
    tree(c, x, 104, r, hex("#5e7d4e"), hex("#48633e"), hex("#5e4632"));
});

bg("quagga", (c) => {
  sky(c, ["#c8d6dc", "#d2dcd8", "#ddd9c8", "#e6dcc0"], 20);
  for (const [x0, w, top] of [[20, 70, 58], [120, 40, 64], [210, 90, 54]]) { // flat-topped hills
    c.rect(x0, top, w, 80 - top, hex("#b49a74"));
    c.tri(x0 - 14, 80, x0, top, x0, 80, hex("#b49a74"));
    c.tri(x0 + w, top, x0 + w + 14, 80, x0 + w, 80, hex("#a38b66"));
    c.rect(x0, top, w, 2, hex("#c9b08a"));
  }
  c.rect(0, 80, 320, 100, hex("#c9b07a")); // dry plain
  speckle(c, 0, 80, 320, 100, hex("#b39a66"), 6, 5);
  speckle(c, 0, 80, 320, 100, hex("#8f9a62"), 41, 9); // karoo bushes
  for (const x of [30, 90, 170, 240, 300]) c.ellipse(x, 98, 6, 3, hex("#7f8a58"));
});

bg("golden_toad", (c) => {
  sky(c, ["#b9c4c0", "#c3ccc6", "#ccd3cc", "#d4d9d2"], 26);
  for (const [x, r] of [[20, 26], [70, 20], [118, 24], [210, 22], [262, 28], [310, 20]])
    tree(c, x, 112, r, hex("#5f7a54"), hex("#4a6243"), hex("#4e4034"));
  c.veil(0, 26, 320, 10, hex("#e4e8e2"), 0.55); // mist drifting through the canopy
  c.veil(0, 56, 320, 8, hex("#e4e8e2"), 0.45);
  c.veil(0, 92, 320, 10, hex("#e4e8e2"), 0.35);
  c.rect(0, 100, 320, 80, hex("#4f5f3e")); // dark wet floor
  speckle(c, 0, 100, 320, 80, hex("#6f8a4c"), 5, 13); // moss
  speckle(c, 0, 100, 320, 80, hex("#3e4a32"), 11, 17);
  for (const [x, y, w] of [[60, 140, 34], [180, 150, 44], [260, 132, 26]]) c.ellipse(x, y, w / 2, 5, hex("#6f8fa0")); // pools
});

bg("pyrenean_ibex", (c) => {
  sky(c, ["#86aed0", "#94b8d6", "#a3c2da", "#b2cce0"], 18);
  ridge(c, (x) => 40 + 22 * Math.abs(Math.sin(x / 37)) + 8 * Math.sin(x / 11), 96, hex("#8a8f98")); // jagged peaks
  for (let x = 0; x < 320; x++) {
    const top = Math.round(40 + 22 * Math.abs(Math.sin(x / 37)) + 8 * Math.sin(x / 11));
    if (top < 56) c.rect(x, top, 1, Math.min(6, 56 - top), hex("#f1f4f6")); // snow on the high bits
  }
  c.rect(0, 92, 320, 88, hex("#8a9a6a")); // alpine meadow
  speckle(c, 0, 92, 320, 88, hex("#7a8a5c"), 6, 19);
  speckle(c, 0, 92, 320, 88, hex("#d8c9a8"), 37, 23); // little flowers
  for (const [x, y, r] of [[40, 110, 10], [150, 104, 7], [280, 116, 12]]) c.ellipse(x, y, r, r * 0.6, hex("#8a8c93")); // boulders
});

bg("thylacine", (c) => {
  sky(c, ["#a7b6c4", "#b1bfca", "#bcc7cf", "#c7cfd3"], 20);
  ridge(c, (x) => 64 + 8 * Math.sin(x / 31) + 4 * Math.sin(x / 7), 96, hex("#7f8f8a")); // highlands
  c.rect(0, 92, 320, 88, hex("#93a06a")); // grassy clearing
  speckle(c, 0, 92, 320, 88, hex("#82905c"), 6, 29);
  speckle(c, 0, 92, 320, 88, hex("#a7b07a"), 12, 31);
  for (const [x, r] of [[10, 22], [40, 18], [66, 24], [96, 16]]) // eucalyptus forest edge
    tree(c, x, 110, r, hex("#7d907a"), hex("#62755f"), hex("#d8d2c4"));
});

bg("great_auk", (c) => {
  sky(c, ["#9aa6b0", "#a5afb6", "#b0b8bc", "#bcc2c4"], 18);
  c.rect(0, 70, 320, 110, hex("#4f6a7e")); // cold sea
  c.rect(0, 72, 320, 1, hex("#7890a0"));
  speckle(c, 0, 74, 320, 106, hex("#6f8a9c"), 23, 37); // white caps
  c.ellipse(160, 140, 190, 52, hex("#7d8188")); // the rocky island
  c.ellipse(150, 136, 160, 40, hex("#8c9097"));
  speckle(c, 0, 96, 320, 84, hex("#e8e6e0"), 19, 41); // guano on the rocks
  c.veil(0, 60, 320, 16, hex("#d4d9dc"), 0.5); // sea fog on the horizon
});

bg("stellers_sea_cow", (c) => {
  sky(c, ["#a2acb4", "#adb5bb", "#b8bfc3", "#c3c8cb"], 16);
  ridge(c, (x) => 40 + 14 * Math.sin(x / 41) + 6 * Math.sin(x / 13), 70, hex("#7a8088")); // snowy island hills
  for (let x = 0; x < 320; x++) {
    const top = Math.round(40 + 14 * Math.sin(x / 41) + 6 * Math.sin(x / 13));
    c.rect(x, top, 1, 4, hex("#eef1f3"));
  }
  c.rect(0, 66, 320, 90, hex("#4a6577")); // sea
  c.rect(0, 68, 320, 1, hex("#71899a"));
  for (let k = 0; k < 9; k++) { // kelp beds breaking the surface
    const x = 20 + k * 34;
    for (let y = 100; y < 150; y++) c.set(x + ((y >> 2) % 2), y, hex("#6a6a3e"));
    c.ellipse(x, 100, 5, 2, hex("#7d7a46"));
  }
  c.rect(0, 156, 320, 24, hex("#8d8a84")); // pebble shore
  speckle(c, 0, 156, 320, 24, hex("#a8a59e"), 4, 43);
});

bg("woolly_mammoth", (c) => {
  sky(c, ["#c4d2dc", "#ccd8de", "#d5dde0", "#dde2e2"], 20);
  ridge(c, (x) => 72 + 5 * Math.sin(x / 29), 90, hex("#a7aca8")); // low distant hills
  c.rect(0, 86, 320, 94, hex("#b8ad86")); // tundra steppe
  speckle(c, 0, 86, 320, 94, hex("#a49a72"), 5, 47);
  speckle(c, 0, 86, 320, 94, hex("#8f9a6a"), 17, 53); // grass tufts
  for (const [x, y, w] of [[40, 120, 60], [190, 140, 80], [290, 112, 40]]) c.ellipse(x, y, w / 2, 6, hex("#eef1f2")); // snow patches
});
