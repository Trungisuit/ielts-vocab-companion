/**
 * Sinh icon cho app (build/icon.ico + build/tray.png) bang Node thuan:
 * ve pixel -> encode PNG (zlib) -> goi vao ICO container.
 * Thiet ke: nen tim indigo bo goc + the flashcard trang + cham amber (noti dot).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG encoder ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- Ve icon ---------- */

function inRoundRect(x, y, rx, ry, rw, rh, rad) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  const cx = Math.max(rx + rad, Math.min(x, rx + rw - rad));
  const cy = Math.max(ry + rad, Math.min(y, ry + rh - rad));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size) {
  const s = size / 256;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      // nen: rounded square gradient indigo -> violet
      if (inRoundRect(x, y, 8 * s, 8 * s, 240 * s, 240 * s, 52 * s)) {
        const t = y / size;
        r = Math.round(79 + (124 - 79) * t);   // 4F46E5 -> 7C3AED
        g = Math.round(70 + (58 - 70) * t);
        b = Math.round(229 + (237 - 229) * t);
        a = 255;
        // the flashcard trang
        if (inRoundRect(x, y, 48 * s, 76 * s, 160 * s, 112 * s, 16 * s)) {
          r = g = b = 255;
          // dong chu tren the (thanh indigo)
          if (inRoundRect(x, y, 68 * s, 104 * s, 120 * s, 14 * s, 7 * s)) {
            r = 79; g = 70; b = 229;
          } else if (inRoundRect(x, y, 68 * s, 130 * s, 80 * s, 14 * s, 7 * s)) {
            r = 165; g = 180; b = 252; // indigo nhat
          } else if (inRoundRect(x, y, 68 * s, 156 * s, 100 * s, 14 * s, 7 * s)) {
            r = 199; g = 210; b = 254;
          }
        }
        // cham thong bao amber goc tren phai cua the
        if (inCircle(x, y, 208 * s, 76 * s, 26 * s)) {
          r = 245; g = 158; b = 11;
        }
      }
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
  return buf;
}

/* ---------- ICO container (PNG entry) ---------- */

function makeIco(pngBuffers) {
  // pngBuffers: [{size, data}]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type icon
  header.writeUInt16LE(pngBuffers.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngBuffers.length;
  for (const { size, data } of pngBuffers) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);   // planes
    e.writeUInt16LE(32, 6);  // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.data)]);
}

/* ---------- Main ---------- */

const outDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sizes = [256, 64, 48, 32, 16];
const pngs = sizes.map((size) => ({ size, data: encodePng(size, size, drawIcon(size)) }));

fs.writeFileSync(path.join(outDir, 'icon.ico'), makeIco(pngs));
fs.writeFileSync(path.join(outDir, 'tray.png'), pngs.find((p) => p.size === 32).data);
fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[0].data);
console.log('Icons written to build/: icon.ico, tray.png, icon.png');
