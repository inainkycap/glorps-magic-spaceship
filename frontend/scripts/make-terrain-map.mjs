// Turns Natural Earth II (shaded relief + water) into the game's pixel-art world map.
//
// 1. Download "Natural Earth II with Shaded Relief and Water", 1:50m:
//      https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-2/
//      (direct: https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip, ~89 MB)
// 2. Unzip it and put NE2_50M_SR_W.tif (10800×5400, ~175 MB) at:
//      frontend/scripts/raw/NE2_50M_SR_W.tif      (gitignored)
// 3. From frontend/:  npm run map:terrain
//      or: node scripts/make-terrain-map.mjs [input.tif] [output.png]
//
// Output: public/map/world.png, 2048×1024 equirectangular, nearest-neighbour
// downsampled, quantised to the 24-colour PALETTE below. Natural Earth is
// public domain (naturalearthdata.com).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { encodeIndexedPng } from "./lib/png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(process.argv[2] ?? `${here}/raw/NE2_50M_SR_W.tif`);
const output = resolve(process.argv[3] ?? `${here}/../public/map/world.png`);

const W = 2048;
const H = 1024;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Soft, low-saturation palette. Keep in sync with the --map-* tokens in src/index.css.
const OCEAN = ["#4c6580", "#56708a", "#607b94", "#6c879e", "#7a93a8", "#8aa2b4"].map(hex); // deep → shallow
const ICE = ["#c8ccce", "#dcddd8", "#eeebe2"].map(hex); // shadow → bright
const LAND = [
  // sage
  "#6f8a6a", "#7f9a77", "#90a986", "#a3b897", "#b8c8aa",
  // olive
  "#7d7b52", "#908c62", "#a39f74", "#b7b287",
  // sand
  "#bfa47e", "#c9b48c", "#d6c39d", "#e2d2b0",
  // rock
  "#8c7d6a", "#a3937e",
].map(hex);
const PALETTE = [...OCEAN, ...ICE, ...LAND]; // 24 colours
const ICE_BASE = OCEAN.length;
const LAND_BASE = OCEAN.length + ICE.length;

// --- colour maths -----------------------------------------------------------
function srgbToLab([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const LAND_LAB = LAND.map(srgbToLab);
const ICE_LAB = ICE.map(srgbToLab);

function nearest(lab, labs) {
  let best = 0;
  let bestD = Infinity;
  labs.forEach(([l, a, b], i) => {
    const d = (lab[0] - l) ** 2 + (lab[1] - a) ** 2 + (lab[2] - b) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

// --- classify each pixel ----------------------------------------------------
const WATER = 0;
const ICE_CLASS = 1;
const LAND_CLASS = 2;

function classify(r, g, b) {
  if (b - r > 45 && b > g + 15) return WATER; // NE2 water: strongly blue-dominant
  if (Math.min(r, g, b) > 190 && b >= r - 4) return ICE_CLASS; // bright, neutral-to-cool
  return LAND_CLASS; // includes near-white deserts (warm: b < r)
}

console.log(`reading ${input}`);
const { data } = await sharp(input, { limitInputPixels: false })
  .removeAlpha()
  .resize(W, H, { kernel: "nearest", fit: "fill" })
  .raw()
  .toBuffer({ resolveWithObject: true });

const cls = new Uint8Array(W * H);
const out = new Uint8Array(W * H);
const cache = new Map();
for (let i = 0; i < W * H; i++) {
  const r = data[i * 3];
  const g = data[i * 3 + 1];
  const b = data[i * 3 + 2];
  const c = classify(r, g, b);
  cls[i] = c;
  if (c === WATER) continue; // coloured by depth below
  const key = (c << 24) | (r << 16) | (g << 8) | b;
  let idx = cache.get(key);
  if (idx === undefined) {
    const lab = srgbToLab([r, g, b]);
    idx = c === ICE_CLASS ? ICE_BASE + nearest(lab, ICE_LAB) : LAND_BASE + nearest(lab, LAND_LAB);
    cache.set(key, idx);
  }
  out[i] = idx;
}

// --- ocean depth bands from distance to the nearest coast -------------------
// 3-4 chamfer distance transform (≈ Euclidean × 3, so halos are round rather
// than diamond-shaped). Columns wrap east–west; two rounds settle the seam.
const INF = 1 << 29;
const dist = new Int32Array(W * H);
for (let i = 0; i < W * H; i++) dist[i] = cls[i] === WATER ? INF : 0;
const col = (x) => (x + W) % W;
for (let round = 0; round < 2; round++) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let d = Math.min(dist[i], dist[y * W + col(x - 1)] + 3);
      if (y > 0) {
        const up = (y - 1) * W;
        d = Math.min(d, dist[up + x] + 3, dist[up + col(x - 1)] + 4, dist[up + col(x + 1)] + 4);
      }
      dist[i] = d;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let d = Math.min(dist[i], dist[y * W + col(x + 1)] + 3);
      if (y < H - 1) {
        const dn = (y + 1) * W;
        d = Math.min(d, dist[dn + x] + 3, dist[dn + col(x + 1)] + 4, dist[dn + col(x - 1)] + 4);
      }
      dist[i] = d;
    }
  }
}
const BANDS = [1, 3, 6, 10, 16]; // px from coast → shallow … deep
for (let i = 0; i < W * H; i++) {
  if (cls[i] !== WATER) continue;
  const px = dist[i] / 3;
  const band = BANDS.findIndex((b) => px <= b);
  out[i] = band === -1 ? 0 : OCEAN.length - 1 - band;
}

mkdirSync(dirname(output), { recursive: true });
const png = encodeIndexedPng(W, H, out, PALETTE);
writeFileSync(output, png);
console.log(`wrote ${output} (${W}×${H}, ${PALETTE.length} colours, ${(png.length / 1024).toFixed(0)} KB)`);
