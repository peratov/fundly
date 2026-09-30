// Draws the AwaFund app icons (teal → violet → coral tile with a white "A")
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
  // "A": two legs meeting at the apex plus a crossbar, drawn as thick line segments
  // in a unit glyph box (0..1), so it scales cleanly to every icon size.
  const box = size - pad * 2;
  const stroke = 0.15;
  const segs = [
    [0.5, 0.16, 0.2, 0.86],
    [0.5, 0.16, 0.8, 0.86],
    [0.34, 0.6, 0.66, 0.6],
  ];
  const near = (u, v, [x0, y0, x1, y1]) => {
    const dx = x1 - x0, dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy)));
    return (u - (x0 + t * dx)) ** 2 + (v - (y0 + t * dy)) ** 2 <= (stroke / 2) ** 2;
  };
  const glyph = (x, y) => {
    const u = (x - pad) / box, v = (y - pad) / box;
    // Flat feet: nothing below the baseline.
    return v <= 0.86 && segs.some((sg) => near(u, v, sg));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inside(x + 0.5, y + 0.5)) continue;
      const [r, gg, b] = grad((x + y) / (2 * size));
      const white = glyph(x + 0.5, y + 0.5);
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
