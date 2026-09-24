// 냉장고 아이콘(PNG)을 외부 라이브러리 없이 생성: node tools/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function inRoundRect(x, y, l, t, r, b, rad) {
  if (x < l || x > r || y < t || y > b) return false;
  const cx = Math.min(Math.max(x, l + rad), r - rad);
  const cy = Math.min(Math.max(y, t + rad), b - rad);
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
}
function fridgePixel(x, y, s) {
  const u = x / s, v = y / s;
  const body = inRoundRect(u, v, 0.24, 0.06, 0.76, 0.94, 0.07);
  if (!body) return [0, 0, 0, 0];
  const edge = !inRoundRect(u, v, 0.255, 0.075, 0.745, 0.925, 0.06);
  if (edge) return [60, 110, 115, 255];
  if (Math.abs(v - 0.6) < 0.012) return [60, 110, 115, 255];           // 문 사이 틈
  if (u > 0.66 && u < 0.69 && ((v > 0.16 && v < 0.4) || (v > 0.66 && v < 0.82))) return [245, 245, 245, 255]; // 손잡이
  if ((u - 0.4) ** 2 + (v - 0.28) ** 2 < 0.0025) return [255, 112, 112, 255]; // 스티커
  return [150, 214, 208, 255];
}
const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png(256, fridgePixel));
fs.writeFileSync(path.join(out, 'tray.png'), png(32, fridgePixel));
console.log('icons written to', out);
