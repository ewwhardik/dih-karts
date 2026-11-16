import fs from "node:fs"; import { execFileSync } from "node:child_process";
export function decode(buf, w, h, f) { const out = Buffer.alloc(w * h * 4), bs = f === 0x83f1 ? 8 : 16; let p = 0;
  const c565 = c => [(c >> 11 & 31) * 255 / 31, (c >> 5 & 63) * 255 / 63, (c & 31) * 255 / 31];
  for (let by = 0; by < h; by += 4) for (let bx = 0; bx < w; bx += 4) { const cp = p + (bs === 16 ? 8 : 0); const c0 = buf.readUInt16LE(cp), c1 = buf.readUInt16LE(cp + 2), bits = buf.readUInt32LE(cp + 4);
    const a = c565(c0), b = c565(c1), pal = [a, b, c0 > c1 || bs === 16 ? a.map((v, i) => (2 * v + b[i]) / 3) : a.map((v, i) => (v + b[i]) / 2), c0 > c1 || bs === 16 ? a.map((v, i) => (v + 2 * b[i]) / 3) : [0, 0, 0]];
    for (let i = 0; i < 16; i++) { const x = bx + (i & 3), y = by + (i >> 2), c = pal[bits >> (2 * i) & 3]; let al = 255; if (bs === 16) { const ab0 = buf[p], ab1 = buf[p + 1]; const ai = i * 3, abits = (buf.readUIntLE(p + 2, 3) , 0); const lo = buf.readUIntLE(p + 2, 3), hi = buf.readUIntLE(p + 5, 3); const code = i < 8 ? lo >> (3 * i) & 7 : hi >> (3 * (i - 8)) & 7; al = code === 0 ? ab0 : code === 1 ? ab1 : ab0 > ab1 ? ((8 - code) * ab0 + (code - 1) * ab1) / 7 : code === 6 ? 0 : code === 7 ? 255 : ((6 - code) * ab0 + (code - 1) * ab1) / 5; }
      if (x < w && y < h) { const o = (y * w + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = al; } }
    p += bs; } return out; }
if (process.argv[1].endsWith("dxt.mjs")) { fs.mkdirSync("png", { recursive: true });
  for (const f of fs.readdirSync("tex")) { const m = f.match(/^(\d+)_(\d+)x(\d+)_(83f\d)/); if (!m) continue; const [_, n, w, h, fm] = m; if (+w < 256 && +h < 256) continue;
    const buf = fs.readFileSync("tex/" + f), rgba = decode(buf, +w, +h, parseInt(fm, 16)); fs.writeFileSync("png/t.raw", rgba);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-i", "png/t.raw", "-vf", "scale=512:-1:force_original_aspect_ratio=decrease,format=rgba", `png/${n}_${w}x${h}.png`]); } }
