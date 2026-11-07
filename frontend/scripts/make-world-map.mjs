// Rasterises Natural Earth land polygons (public domain, naturalearthdata.com)
// into a tiny equirectangular pixel-art PNG: 1 pixel per degree.
//
// Usage:
//   curl -L -o ne_110m_land.geojson \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson
//   node scripts/make-world-map.mjs ne_110m_land.geojson src/assets/world-map.png
//
// Pixel (col, row) covers lon -180+col..-179+col, lat 90-row..89-row, so the map
// matches the projection in src/geo.ts: x% = (lon+180)/360, y% = (90-lat)/180.

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node make-world-map.mjs <land.geojson> <out.png>");
  process.exit(1);
}

const W = 360;
const H = 180;

const COLORS = {
  deep: [16, 18, 58], // open ocean
  shallow: [28, 36, 92], // ocean next to land
  land: [46, 104, 78],
  coast: [92, 160, 104], // land next to ocean
};

// --- collect polygon rings as [lon, lat][] -------------------------------
const geo = JSON.parse(readFileSync(input, "utf8"));
const rings = [];
for (const f of geo.features) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) rings.push(ring);
}

// --- scanline fill (even-odd) at pixel centres ----------------------------
const land = new Uint8Array(W * H);
for (let row = 0; row < H; row++) {
  const lat = 90 - row - 0.5;
  const xs = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[j];
      if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  xs.sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const c0 = Math.max(0, Math.ceil(xs[k] + 180 - 0.5));
    const c1 = Math.min(W - 1, Math.floor(xs[k + 1] + 180 - 0.5));
    for (let c = c0; c <= c1; c++) land[row * W + c] = 1;
  }
}

// --- colour with a one-pixel coastline ------------------------------------
const at = (r, c) => land[r * W + ((c + W) % W)]; // wraps east-west
const rgb = Buffer.alloc(H * (1 + W * 3));
for (let r = 0; r < H; r++) {
  rgb[r * (1 + W * 3)] = 0; // PNG filter: none
  for (let c = 0; c < W; c++) {
    const isLand = at(r, c);
    let edge = false;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rr = r + dr;
      if (rr >= 0 && rr < H && at(rr, c + dc) !== isLand) edge = true;
    }
    const col = isLand ? (edge ? COLORS.coast : COLORS.land) : edge ? COLORS.shallow : COLORS.deep;
    col.forEach((v, i) => (rgb[r * (1 + W * 3) + 1 + c * 3 + i] = v));
  }
}

// --- minimal PNG encoder ---------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(rgb, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(output, png);
console.log(`wrote ${output} (${W}x${H}, ${png.length} bytes)`);
