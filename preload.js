// Runs in the page's main world before the game.
try { navigator.serviceWorker.register = () => Promise.reject(new Error("sw off")); } catch {} // SW would serve the unpatched build
window.__dihUncap = true;
// Experimental low-latency canvas (off by default): desynchronized (skips compositor queueing) + high-performance GPU. F9 toggles (applies on next launch).
const LOWLAT = (() => { try { return JSON.parse(localStorage.getItem("dih.lowlat")) ?? false; } catch { return true; } })();
if (LOWLAT) { const gc = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { if (/^webgl/.test(t)) a = { ...a, desynchronized: true, powerPreference: "high-performance" }; return gc.call(this, t, a); }; }
const LS = (k, d) => { try { return JSON.parse(localStorage.getItem("dih." + k)) ?? d; } catch { return d; } }, SAVE = (k, v) => localStorage.setItem("dih." + k, JSON.stringify(v));
const CAPS = [0, 240, 165, 144, 120, 60], SCALES = [1, 0.75, 0.5, 1.25];
let capI = LS("cap", 0), scaleI = LS("scale", 0), wm = LS("wm", true);
window.__dihCap = CAPS[capI];
// save GPU/battery while the window is in the background
let wasFocused = false; addEventListener("blur", () => { if (wasFocused) window.__dihCap = 30; }); addEventListener("focus", () => { wasFocused = true; window.__dihCap = CAPS[capI]; });
const baseDpr = Object.getOwnPropertyDescriptor(Window.prototype, "devicePixelRatio") || Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => (baseDpr.get ? baseDpr.get.call(window) : baseDpr.value) * SCALES[scaleI] });
addEventListener("DOMContentLoaded", () => {
  const css = document.createElement("style");
  css.textContent = "#frameRight,#frameLeft,#frameBanner,[id^=adContainer],[id^=pw_]{display:none!important}html,body{margin:0!important;height:100%!important;overflow:hidden!important;background:#0c2f6b}#mainContainer,#gameContainer,#gameCanvasWrapper,#gameCanvas,#frameBar{width:100vw!important;max-width:none!important}#mainContainer{height:100vh!important;max-height:none!important}#gameContainer,#gameCanvasWrapper,#gameCanvas{height:calc(100vh - 44px)!important;max-height:none!important}#mainContainer,#gameContainer{margin:0!important}#frameBar{position:fixed!important;left:0!important;top:auto!important;bottom:0!important;height:44px!important;z-index:5!important}"
    + "#dihWm{position:fixed;left:84px;bottom:13px;white-space:nowrap;z-index:99999;pointer-events:none;font:900 12px 'Arial Black',Impact,sans-serif;letter-spacing:.12em;color:#cfe6ff;text-shadow:0 1px 0 #06285e,0 0 6px #06285e;display:flex;gap:8px;align-items:center}"
    + "#dihWm b{color:#ff8a3d}#dihToast{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none;background:rgba(6,28,70,.92);color:#fff;border:2px solid #4ea3ff;border-radius:12px;padding:8px 16px;font:800 15px Arial,sans-serif;opacity:0;transition:opacity .2s}";
  document.head.appendChild(css);
  const DC = "https://discord.gg/KkCjEdv9Jv", YT = "https://www.youtube.com/channel/UCliKSEDHMhVhwLikfAbY8YA/"; // the page's own social buttons
  for (const a of document.querySelectorAll("a[href*=discord]")) a.href = DC;
  for (const a of document.querySelectorAll("a[href*=\"youtube\"],a[href*=\"youtu.be\"]")) a.href = YT;
  const mc = document.getElementById("mainContainer"); if (mc) for (const ms of [300, 1500, 4000]) setTimeout(() => { mc.classList.remove("hasRightAd"); dispatchEvent(new Event("resize")); }, ms);
  const w = document.createElement("div"); w.id = "dihWm"; w.innerHTML = "<span>DIH <b>KARTS</b> v0.4</span><span style='opacity:.55'>|</span><span>Dev: ewwhardik <i style='opacity:.7;font-style:normal'>(Dih Clients)</i></span><span style='opacity:.55'>|</span><a href='https://discord.gg/KkCjEdv9Jv' style='color:#7fd0ff;text-decoration:none;pointer-events:auto'>discord.gg/KkCjEdv9Jv</a>"; w.style.display = wm ? "flex" : "none"; document.body.appendChild(w);
  const t = document.createElement("div"); t.id = "dihToast"; document.body.appendChild(t); let tt;
  const toast = s => { t.textContent = s; t.style.opacity = 1; clearTimeout(tt); tt = setTimeout(() => (t.style.opacity = 0), 1400); };
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#frameFullscreenBtn")) { e.stopImmediatePropagation(); e.preventDefault(); require("electron").ipcRenderer.send("dih:fs"); } }, true);
  addEventListener("keydown", e => {
    if (e.code === "F6") { capI = (capI + 1) % CAPS.length; window.__dihCap = CAPS[capI]; SAVE("cap", capI); toast("FPS limit: " + (CAPS[capI] || "Unlimited")); }
    else if (e.code === "F7") { scaleI = (scaleI + 1) % SCALES.length; SAVE("scale", scaleI); dispatchEvent(new Event("resize")); toast("Render scale: " + SCALES[scaleI] + "x"); }
    else if (e.code === "F8") { wm = !wm; SAVE("wm", wm); w.style.display = wm ? "flex" : "none"; toast("Watermark " + (wm ? "on" : "off")); }
    else if (e.code === "F9") { localStorage.setItem("dih.lowlat", JSON.stringify(!LOWLAT)); toast("Low-latency mode " + (!LOWLAT ? "ON" : "OFF") + " — restart to apply"); }
    else return; e.preventDefault();
  }, true);
});

// --- In-game art swaps (Smash Karts logo -> Dih Karts, Tall Team mark -> Dih Clients): the art lives in DXT5 UI atlases,
// so we replace blocks while the atlas is uploaded to the GPU. assets/patches.bin is built by tools/buildpatch.mjs;
// each patch only applies to the exact texture build it was made from (signature check).
try {
  const fs = require("fs"), path = require("path"), bin = fs.readFileSync(path.join(__dirname, "assets", "patches.bin"));
  const fnv = b => { let h = 2166136261; for (const x of b) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return h; };
  const PATCHES = []; let o = 4;
  for (let i = 0, n = bin.readUInt32LE(0); i < n; i++) { const P = { tw: bin.readUInt32LE(o), th: bin.readUInt32LE(o + 4), sig: bin.readUInt32LE(o + 8), lv: {}, armed: false }, nl = bin.readUInt32LE(o + 12); o += 16;
    for (let k = 0; k < nl; k++) { const [l, bx0, by0, bw, bh] = [0, 1, 2, 3, 4].map(j => bin.readUInt32LE(o + j * 4)); P.lv[l] = { bx0, by0, bw, bh, d: bin.subarray(o + 20, o + 20 + bw * bh * 16) }; o += 20 + bw * bh * 16; } PATCHES.push(P); }
  const GL = WebGL2RenderingContext.prototype;
  const wrap = (name, wi, fi, sub) => { const orig = GL[name]; GL[name] = function (...a) {
    try {
      const level = a[1], w = a[wi], h = a[wi + 1], si = a.findIndex(x => ArrayBuffer.isView(x));
      if (si > 0 && a[fi] === 0x83f3 && (!sub || (a[2] === 0 && a[3] === 0))) for (const P of PATCHES) if (w === P.tw >> level && h === P.th >> level) {
        const src = a[si], off = a[si + 1] || 0, len = a[si + 2] || src.byteLength - off, v = new Uint8Array(src.buffer, src.byteOffset + off, len), bpr = (w / 4) * 16;
        if (level === 0) { const L = P.lv[0], row = by => v.subarray(by * bpr + L.bx0 * 16, by * bpr + (L.bx0 + L.bw) * 16); P.armed = len === w * h && fnv(Buffer.concat([row(L.by0), row(L.by0 + L.bh - 1)])) === P.sig; }
        const L = P.armed && P.lv[level];
        if (L) { const c = new Uint8Array(v); for (let r = 0; r < L.bh; r++) c.set(L.d.subarray(r * L.bw * 16, (r + 1) * L.bw * 16), (L.by0 + r) * bpr + L.bx0 * 16); a.length = si; a[si] = c; }
        break;
      }
    } catch (e) { console.log("[dih] art patch error", e.message); }
    return orig.apply(this, a); }; };
  wrap("compressedTexSubImage2D", 4, 6, true); wrap("compressedTexImage2D", 3, 2, false);
} catch (e) { console.log("[dih] art patches disabled", e.message); }
