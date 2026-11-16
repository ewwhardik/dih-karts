// node buildpatch.mjs <orig L0 dxt5 bin> <dih_top.png> <out logo.bin>
import fs from "node:fs"; import { build, W, RW, RH } from "./compose.mjs";
const [orig, top, out] = process.argv.slice(2);
const atlas = build(orig, top);
function down(src, size) { const n = size >> 1, o = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let r = 0, g = 0, b = 0, a = 0; for (let j = 0; j < 4; j++) { const p = ((2 * y + (j >> 1)) * size + 2 * x + (j & 1)) * 4, al = src[p + 3]; r += src[p] * al; g += src[p + 1] * al; b += src[p + 2] * al; a += al; }
    const q = (y * n + x) * 4; if (a) { o[q] = r / a; o[q + 1] = g / a; o[q + 2] = b / a; } o[q + 3] = a / 4; } return o; }
function enc565(c) { return ((c[0] * 31 / 255 + .5 | 0) << 11) | ((c[1] * 63 / 255 + .5 | 0) << 5) | (c[2] * 31 / 255 + .5 | 0); }
function dec565(v) { return [(v >> 11 & 31) * 255 / 31, (v >> 5 & 63) * 255 / 63, (v & 31) * 255 / 31]; }
function block(img, size, bx, by) { const o = Buffer.alloc(16), px = []; for (let i = 0; i < 16; i++) { const p = ((by * 4 + (i >> 2)) * size + bx * 4 + (i & 3)) * 4; px.push([img[p], img[p + 1], img[p + 2], img[p + 3]]); }
  let a0 = 0, a1 = 255; for (const p of px) { a0 = Math.max(a0, p[3]); a1 = Math.min(a1, p[3]); } a0 = Math.round(a0); a1 = Math.round(a1); o[0] = a0; o[1] = a1;
  const av = [a0, a1]; if (a0 > a1) for (let i = 1; i < 7; i++) av.push(((7 - i) * a0 + i * a1) / 7); else { for (let i = 1; i < 5; i++) av.push(((5 - i) * a0 + i * a1) / 5); av.push(0, 255); }
  let bits = 0n; px.forEach((p, i) => { let bi = 0, bd = 1e9; av.forEach((v, k) => { const d = Math.abs(v - p[3]); if (d < bd) { bd = d; bi = k; } }); bits |= BigInt(bi) << BigInt(3 * i); }); for (let i = 0; i < 6; i++) o[2 + i] = Number(bits >> BigInt(8 * i) & 255n);
  const op = px.filter(p => p[3] > 8), use = op.length ? op : px; let lo = [255, 255, 255], hi = [0, 0, 0]; for (const p of use) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const ax = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]; let mn = 1e9, mx = -1e9, pmn = lo, pmx = hi; for (const p of use) { const d = p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2]; if (d < mn) { mn = d; pmn = p; } if (d > mx) { mx = d; pmx = p; } }
  let c0 = enc565(pmx), c1 = enc565(pmn); if (c0 < c1) [c0, c1] = [c1, c0]; const d0 = dec565(c0), d1 = dec565(c1), pal = [d0, d1, d0.map((v, i) => (2 * v + d1[i]) / 3), d0.map((v, i) => (v + 2 * d1[i]) / 3)];
  o.writeUInt16LE(c0, 8); o.writeUInt16LE(c1, 10); let ib = 0; px.forEach((p, i) => { let bi = 0, bd = 1e12; pal.forEach((c, k) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; bi = k; } }); ib |= bi << (2 * i); }); o.writeUInt32LE(ib >>> 0, 12); return o; }
const levels = []; let img = atlas, size = W;
for (let l = 0; l < 4; l++) { const bw = Math.ceil((RW >> l) / 4), bh = Math.ceil((RH >> l) / 4), bufs = [];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) bufs.push(block(img, size, bx, by)); levels.push({ l, size, bw, bh, data: Buffer.concat(bufs) }); img = down(img, size); size >>= 1; }
// signature of the ORIGINAL L0 region (first + last block row) so the patch only applies to the build it was made for
const o0 = fs.readFileSync(orig), row = Math.ceil(RW / 4) * 16, bpr = (W / 4) * 16, fnv = b => { let h = 2166136261; for (const x of b) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return h; };
const sig = fnv(Buffer.concat([o0.subarray(0, row), o0.subarray((Math.ceil(RH / 4) - 1) * bpr, (Math.ceil(RH / 4) - 1) * bpr + row)]));
const head = Buffer.alloc(8); head.writeUInt32LE(sig, 0); head.writeUInt32LE(levels.length, 4);
const parts = [head]; for (const L of levels) { const h = Buffer.alloc(12); h.writeUInt32LE(L.l, 0); h.writeUInt32LE(L.bw, 4); h.writeUInt32LE(L.bh, 8); parts.push(h, L.data); }
fs.writeFileSync(out, Buffer.concat(parts)); console.log("sig", sig, "bytes", fs.statSync(out).size);
