// Draws the Fundly app icons (teal → violet → coral tile with a white "F")
// straight into PNG files, so the repo needs no image tooling.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const stops = [[20, 184, 166], [139, 92, 246], [255, 107, 74]];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const grad = (t) => (t < 0.5 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], (t - 0.5) * 2));

function draw(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : size * 0.22;
  const pad = maskable ? size * 0.2 : size * 0.1; // maskable icons keep the glyph inside the safe zone
  const inside = (x, y) => {
    if (!radius) return true;
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  // "F" made of three bars, proportional to the glyph box.
  const g = (v) => pad + v * (size - pad * 2);
  const bars = [
    [g(0.3), g(0.18), g(0.44), g(0.82)],
    [g(0.3), g(0.18), g(0.74), g(0.32)],
    [g(0.3), g(0.44), g(0.66), g(0.58)],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inside(x + 0.5, y + 0.5)) continue;
      const [r, gg, b] = grad((x + y) / (2 * size));
      const white = bars.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
      px[i] = white ? 255 : r;
      px[i + 1] = white ? 255 : gg;
      px[i + 2] = white ? 255 : b;
      px[i + 3] = 255;
    }
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync("web/public/icons/icon-192.png", draw(192));
writeFileSync("web/public/icons/icon-512.png", draw(512));
writeFileSync("web/public/icons/maskable-512.png", draw(512, { maskable: true }));
console.log("icons written");
