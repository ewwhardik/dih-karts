// node tools/buildpatch.mjs <dump dir with original DXT5 level-0 files> <overlay dir with PNGs> <out patches.bin>
// Builds assets/patches.bin: DXT5 blocks that replace a region of a game texture atlas (all mip levels 0-3).
// Original textures come from a dump of the game's GPU uploads (see README); they are NOT committed.
import fs from "node:fs"; import { execFileSync } from "node:child_process"; import { decode } from "./dxt.mjs";
const [dumpDir, overlayDir, out] = process.argv.slice(2);
// Regions are in DATA orientation (row 0 = bottom of the picture). Overlay PNGs are upright; their bottom edge sits on the region's first row.
const SPECS = [
  { name: "logo", orig: "1_2048x2048_83f3.bin", tw: 2048, th: 2048, x: 0, r: 0, w: 740, h: 340, top: "dih_top.png", keepBelowVisualY: 112 }, // SMASH -> DIH, keeps the KARTS art
  { name: "tallteam", orig: "3_512x1024_83f3.bin", tw: 512, th: 1024, x: 0, r: 556, w: 256, h: 148, top: "clients_top.png" },                // Tall Team mark -> DIH CLIENTS
];
const png = f => execFileSync("ffmpeg", ["-v", "error", "-i", f, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 28 });
const pngSize = f => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).toString().trim().split(",").map(Number);
const fnv = b => { let h = 2166136261; for (const x of b) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return h; };

function down(src, size, hgt) { const nw = size >> 1, nh = hgt >> 1, o = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { let r = 0, g = 0, b = 0, a = 0; for (let j = 0; j < 4; j++) { const p = ((2 * y + (j >> 1)) * size + 2 * x + (j & 1)) * 4, al = src[p + 3]; r += src[p] * al; g += src[p + 1] * al; b += src[p + 2] * al; a += al; }
    const q = (y * nw + x) * 4; if (a) { o[q] = r / a; o[q + 1] = g / a; o[q + 2] = b / a; } o[q + 3] = a / 4; } return o; }
const e565 = c => ((c[0] * 31 / 255 + .5 | 0) << 11) | ((c[1] * 63 / 255 + .5 | 0) << 5) | (c[2] * 31 / 255 + .5 | 0);
const d565 = v => [(v >> 11 & 31) * 255 / 31, (v >> 5 & 63) * 255 / 63, (v & 31) * 255 / 31];
function block(img, size, bx, by) { const o = Buffer.alloc(16), px = [];
  for (let i = 0; i < 16; i++) { const p = ((by * 4 + (i >> 2)) * size + bx * 4 + (i & 3)) * 4; px.push([img[p], img[p + 1], img[p + 2], img[p + 3]]); }
  let a0 = 0, a1 = 255; for (const p of px) { a0 = Math.max(a0, p[3]); a1 = Math.min(a1, p[3]); } a0 = Math.round(a0); a1 = Math.round(a1); o[0] = a0; o[1] = a1;
  const av = [a0, a1]; if (a0 > a1) for (let i = 1; i < 7; i++) av.push(((7 - i) * a0 + i * a1) / 7); else { for (let i = 1; i < 5; i++) av.push(((5 - i) * a0 + i * a1) / 5); av.push(0, 255); }
  let bits = 0n; px.forEach((p, i) => { let bi = 0, bd = 1e9; av.forEach((v, k) => { const d = Math.abs(v - p[3]); if (d < bd) { bd = d; bi = k; } }); bits |= BigInt(bi) << BigInt(3 * i); }); for (let i = 0; i < 6; i++) o[2 + i] = Number(bits >> BigInt(8 * i) & 255n);
  const op = px.filter(p => p[3] > 8), use = op.length ? op : px; const lo = [255, 255, 255], hi = [0, 0, 0]; for (const p of use) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const ax = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]; let mn = 1e9, mx = -1e9, pmn = lo, pmx = hi; for (const p of use) { const d = p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2]; if (d < mn) { mn = d; pmn = p; } if (d > mx) { mx = d; pmx = p; } }
  let c0 = e565(pmx), c1 = e565(pmn); if (c0 < c1) [c0, c1] = [c1, c0]; const d0 = d565(c0), d1 = d565(c1), pal = [d0, d1, d0.map((v, i) => (2 * v + d1[i]) / 3), d0.map((v, i) => (v + 2 * d1[i]) / 3)];
  o.writeUInt16LE(c0, 8); o.writeUInt16LE(c1, 10); let ib = 0; px.forEach((p, i) => { let bi = 0, bd = 1e12; pal.forEach((c, k) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; bi = k; } }); ib |= bi << (2 * i); }); o.writeUInt32LE(ib >>> 0, 12); return o; }

const parts = [Buffer.from([SPECS.length, 0, 0, 0])];
for (const S of SPECS) {
  const orig = fs.readFileSync(`${dumpDir}/${S.orig}`), img = decode(orig, S.tw, S.th, 0x83f3), top = png(`${overlayDir}/${S.top}`), [tw, th] = pngSize(`${overlayDir}/${S.top}`);
  const row = y => S.r + S.h - 1 - y; // visual y within region -> data row
  for (let y = 0; y < (S.keepBelowVisualY ?? S.h); y++) for (let x = 0; x < S.w; x++) img.fill(0, (row(y) * S.tw + S.x + x) * 4, (row(y) * S.tw + S.x + x) * 4 + 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const o = (y * tw + x) * 4, a = top[o + 3] / 255; if (!a) continue; const d = (row(y) * S.tw + S.x + x) * 4, da = img[d + 3] / 255, oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) img[d + k] = (top[o + k] * a + img[d + k] * da * (1 - a)) / (oa || 1); img[d + 3] = oa * 255; }
  const levels = []; let cur = img, cw = S.tw, ch = S.th;
  for (let l = 0; l < 4; l++) { const bx0 = (S.x >> l) >> 2, by0 = (S.r >> l) >> 2, bx1 = Math.ceil(((S.x + S.w) >> l) / 4), by1 = Math.ceil(((S.r + S.h) >> l) / 4), bufs = [];
    for (let by = by0; by < by1; by++) for (let bx = bx0; bx < bx1; bx++) bufs.push(block(cur, cw, bx, by)); levels.push({ l, bx0, by0, bw: bx1 - bx0, bh: by1 - by0, data: Buffer.concat(bufs) }); cur = down(cur, cw, ch); cw >>= 1; ch >>= 1; }
  // signature of the ORIGINAL level-0 region (first + last block row) so a patch only applies to the build it was made from
  const L0 = levels[0], bpr = (S.tw / 4) * 16, rowBytes = (by) => orig.subarray(by * bpr + L0.bx0 * 16, by * bpr + (L0.bx0 + L0.bw) * 16);
  const sig = fnv(Buffer.concat([rowBytes(L0.by0), rowBytes(L0.by0 + L0.bh - 1)]));
  const h = Buffer.alloc(16); h.writeUInt32LE(S.tw, 0); h.writeUInt32LE(S.th, 4); h.writeUInt32LE(sig, 8); h.writeUInt32LE(levels.length, 12); parts.push(h);
  for (const L of levels) { const lh = Buffer.alloc(20); [L.l, L.bx0, L.by0, L.bw, L.bh].forEach((v, i) => lh.writeUInt32LE(v, i * 4)); parts.push(lh, L.data); }
  console.log(S.name, "sig", sig);
}
fs.writeFileSync(out, Buffer.concat(parts)); console.log("bytes", fs.statSync(out).size);
