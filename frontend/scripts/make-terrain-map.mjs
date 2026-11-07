// Turns Natural Earth II (shaded relief + water) into the game's two pixel-art world maps.
//
// 1. Download "Natural Earth II with Shaded Relief and Water", 1:50m:
//      https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-2/
//      (direct: https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip, ~89 MB)
// 2. Unzip it and put NE2_50M_SR_W.tif (10800×5400, ~175 MB) at:
//      frontend/scripts/raw/NE2_50M_SR_W.tif      (gitignored)
// 3. From frontend/:  npm run map:terrain
//      or: node scripts/make-terrain-map.mjs [input.tif] [outDir]
//
// Outputs (outDir defaults to public/map/), both equirectangular:
//   world.png         2048×1024, nearest-neighbour, 24 colours: detailed map (zoom ≥ 2×)
//   world-simple.png  1024×512, smoothed, 12 colours: overview map (zoom < 2×)
// Both palettes are darkened and desaturated (MUTE) so pins, Glorp and UI stand
// out. Natural Earth is public domain (naturalearthdata.com).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { encodeIndexedPng } from "./lib/png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(process.argv[2] ?? `${here}/raw/NE2_50M_SR_W.tif`);
const outDir = resolve(process.argv[3] ?? `${here}/../public/map`);

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

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

function rgbToHsl([r, g, b]) {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map((v) => Math.round(v * 255));
}

/** Darken ~17% and desaturate ~20%, so the map sits behind the UI. */
const MUTE = { lightness: 0.83, saturation: 0.8 };
const mute = (rgb) => {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h, s * MUTE.saturation, l * MUTE.lightness]);
};

function nearest(lab, labs) {
  let best = 0;
  let bestD = Infinity;
  labs.forEach(([l, a, b], i) => {
    const d = (lab[0] - l) ** 2 + (lab[1] - a) ** 2 + (lab[2] - b) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

// --- classify each source pixel ---------------------------------------------
const WATER = 0;
const ICE_CLASS = 1;
const LAND_CLASS = 2;

function classify(r, g, b) {
  if (b - r > 45 && b > g + 15) return WATER; // NE2 water: strongly blue-dominant
  if (Math.min(r, g, b) > 190 && b >= r - 4) return ICE_CLASS; // bright, neutral-to-cool
  return LAND_CLASS; // includes near-white deserts (warm: b < r)
}

/** 3-4 chamfer distance (≈ Euclidean × 3) from every water pixel to land; wraps east–west. */
function coastDistance(cls, W, H) {
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
  return dist;
}

/** 3×3 majority filter on an index image (wraps east–west): removes speckle. */
function modeFilter(idx, W, H) {
  const out = new Uint8Array(idx.length);
  const counts = new Uint8Array(256);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const seen = [];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(H - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const v = idx[yy * W + ((x + dx + W) % W)];
          if (counts[v]++ === 0) seen.push(v);
        }
      }
      let best = idx[y * W + x];
      for (const v of seen) if (counts[v] > counts[best]) best = v;
      out[y * W + x] = best;
      for (const v of seen) counts[v] = 0;
    }
  }
  return out;
}

/**
 * Render one map. Colours are matched against the bright `palette` (close to
 * the source), then the muted version is what gets written.
 */
async function render({ name, W, H, smooth, ocean, ice, land, bands, modePasses }) {
  let pipeline = sharp(input, { limitInputPixels: false }).removeAlpha();
  pipeline = smooth
    ? pipeline.resize(W, H, { kernel: "lanczos3", fit: "fill" }).blur(0.8)
    : pipeline.resize(W, H, { kernel: "nearest", fit: "fill" });
  const { data } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  const OCEAN = ocean.map(hex);
  const ICE = ice.map(hex);
  const LAND = land.map(hex);
  const ICE_LAB = ICE.map(srgbToLab);
  const LAND_LAB = LAND.map(srgbToLab);
  const ICE_BASE = OCEAN.length;
  const LAND_BASE = OCEAN.length + ICE.length;
  const WATER_IDX = 0; // provisional; replaced by depth bands below

  let out = new Uint8Array(W * H);
  const cache = new Map();
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const c = classify(r, g, b);
    if (c === WATER) {
      out[i] = WATER_IDX;
      continue;
    }
    const key = (c << 24) | (r << 16) | (g << 8) | b;
    let idx = cache.get(key);
    if (idx === undefined) {
      const lab = srgbToLab([r, g, b]);
      idx = c === ICE_CLASS ? ICE_BASE + nearest(lab, ICE_LAB) : LAND_BASE + nearest(lab, LAND_LAB);
      cache.set(key, idx);
    }
    out[i] = idx;
  }
  for (let p = 0; p < modePasses; p++) out = modeFilter(out, W, H);

  const cls = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) cls[i] = out[i] < ICE_BASE ? WATER : LAND_CLASS;
  const dist = coastDistance(cls, W, H);
  for (let i = 0; i < W * H; i++) {
    if (cls[i] !== WATER) continue;
    const band = bands.findIndex((b) => dist[i] / 3 <= b);
    out[i] = band === -1 ? 0 : OCEAN.length - 1 - band;
  }

  const palette = [...OCEAN, ...ICE, ...LAND].map(mute);
  const png = encodeIndexedPng(W, H, out, palette);
  const file = `${outDir}/${name}`;
  writeFileSync(file, png);
  console.log(`wrote ${file} (${W}×${H}, ${palette.length} colours, ${(png.length / 1024).toFixed(0)} KB)`);
  return palette;
}

console.log(`reading ${input}`);
mkdirSync(outDir, { recursive: true });

// Detailed: 24 colours. ocean deep → shallow, ice shadow → bright, then land.
const detailed = await render({
  name: "world.png",
  W: 2048,
  H: 1024,
  smooth: false,
  ocean: ["#4c6580", "#56708a", "#607b94", "#6c879e", "#7a93a8", "#8aa2b4"],
  ice: ["#c8ccce", "#dcddd8", "#eeebe2"],
  land: [
    "#6f8a6a", "#7f9a77", "#90a986", "#a3b897", "#b8c8aa", // sage
    "#7d7b52", "#908c62", "#a39f74", "#b7b287", // olive
    "#bfa47e", "#c9b48c", "#d6c39d", "#e2d2b0", // sand
    "#8c7d6a", "#a3937e", // rock
  ],
  bands: [1, 3, 6, 10, 16],
  modePasses: 0,
});

// Overview: 12 colours, smoothed, speckle removed.
await render({
  name: "world-simple.png",
  W: 1024,
  H: 512,
  smooth: true,
  ocean: ["#4c6580", "#607b94", "#7a93a8"],
  ice: ["#d0d2d0", "#eae7de"],
  land: ["#6f8a6a", "#86a07c", "#a3b897", "#908c62", "#c9b48c", "#ddcca9", "#a3937e"],
  bands: [2, 5],
  modePasses: 2,
});

const [r, g, b] = detailed[0];
console.log(`deep ocean is now #${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")} (update --map-ocean in src/index.css)`);
