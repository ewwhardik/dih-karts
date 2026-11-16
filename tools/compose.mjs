import fs from "node:fs"; import { execFileSync } from "node:child_process"; import { decode } from "./dxt.mjs";
export const W = 2048, RW = 740, RH = 340, CUT = +(process.env.CUT || 112);
const png = f => execFileSync("ffmpeg", ["-v", "error", "-i", f, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 28 });
export function build(atlasFile, topFile) {
  const atlas = decode(fs.readFileSync(atlasFile), W, W, 0x83f3); // data orientation (row 0 = bottom of image)
  const top = png(topFile); // 740x340 upright
  // upright region pixel (x, y) <-> atlas data row (RH-1-y)
  const px = (x, y) => ((RH - 1 - y) * W + x) * 4;
  for (let y = 0; y < CUT; y++) for (let x = 0; x < RW; x++) atlas.fill(0, px(x, y), px(x, y) + 4);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const o = (y * RW + x) * 4, a = top[o + 3] / 255; if (!a) continue; const d = px(x, y); const da = atlas[d + 3] / 255, oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) atlas[d + k] = (top[o + k] * a + atlas[d + k] * da * (1 - a)) / (oa || 1); atlas[d + 3] = oa * 255; }
  return atlas;
}
if (process.argv[1].endsWith("compose.mjs")) { const atlas = build("tex/1_2048x2048_83f3.bin", "dih_top.png"); const reg = Buffer.alloc(RW * RH * 4);
  for (let y = 0; y < RH; y++) atlas.copy(reg, y * RW * 4, ((RH - 1 - y) * W) * 4, ((RH - 1 - y) * W + RW) * 4);
  fs.writeFileSync("png/reg.raw", reg); execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${RW}x${RH}`, "-i", "png/reg.raw", "-f", "lavfi", "-i", "color=c=0x3b82f6:s=740x340", "-filter_complex", "[1][0]overlay", "-frames:v", "1", "preview.png"]); }
