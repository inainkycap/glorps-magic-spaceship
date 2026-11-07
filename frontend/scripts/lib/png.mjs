// Minimal PNG encoder (no dependencies): indexed (palette) and RGBA images.
import { deflateSync } from "node:zlib";

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

function png(width, height, colorType, rowBytes, rows, extraChunks = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  const raw = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + rowBytes)] = 0; // filter: none
    rows(y, raw, y * (1 + rowBytes) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extraChunks,
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Indexed PNG. `indices` is a Uint8Array of width*height palette indices;
 * `palette` is an array of [r, g, b] (max 256 entries).
 */
export function encodeIndexedPng(width, height, indices, palette) {
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach(([r, g, b], i) => plte.set([r, g, b], i * 3));
  return png(
    width,
    height,
    3,
    width,
    (y, out, o) => out.set(indices.subarray(y * width, (y + 1) * width), o),
    [chunk("PLTE", plte)],
  );
}

/** RGBA PNG from a Uint8Array of width*height*4 bytes. */
export function encodeRgbaPng(width, height, rgba) {
  return png(width, height, 6, width * 4, (y, out, o) =>
    out.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), o),
  );
}
