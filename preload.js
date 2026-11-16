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
const baseDpr = Object.getOwnPropertyDescriptor(Window.prototype, "devicePixelRatio") || Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => (baseDpr.get ? baseDpr.get.call(window) : baseDpr.value) * SCALES[scaleI] });
addEventListener("DOMContentLoaded", () => {
  const css = document.createElement("style");
  css.textContent = "#frameRight,#frameLeft,#frameBanner,[id^=adContainer],[id^=pw_]{display:none!important}#mainContainer,#gameContainer,#gameCanvasWrapper,#gameCanvas,#frameBar{width:100vw!important;max-width:none!important}#mainContainer,#gameContainer{margin:0!important}"
    + "#dihWm{position:fixed;left:84px;bottom:13px;white-space:nowrap;z-index:99999;pointer-events:none;font:900 12px 'Arial Black',Impact,sans-serif;letter-spacing:.12em;color:#cfe6ff;text-shadow:0 1px 0 #06285e,0 0 6px #06285e;display:flex;gap:8px;align-items:center}"
    + "#dihWm b{color:#ff8a3d}#dihToast{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none;background:rgba(6,28,70,.92);color:#fff;border:2px solid #4ea3ff;border-radius:12px;padding:8px 16px;font:800 15px Arial,sans-serif;opacity:0;transition:opacity .2s}";
  document.head.appendChild(css);
  const DC = "https://discord.gg/KkCjEdv9Jv"; for (const a of document.querySelectorAll("a[href*=discord]")) a.href = DC; // the page's own Discord buttons
  const mc = document.getElementById("mainContainer"); if (mc) for (const ms of [300, 1500, 4000]) setTimeout(() => { mc.classList.remove("hasRightAd"); dispatchEvent(new Event("resize")); }, ms);
  const w = document.createElement("div"); w.id = "dihWm"; w.innerHTML = "<span>DIH <b>KARTS</b> v0.3</span><span style='opacity:.55'>|</span><span>Dev: ewwhardik <i style='opacity:.7;font-style:normal'>(Dih Clients)</i></span><span style='opacity:.55'>|</span><a href='https://discord.gg/KkCjEdv9Jv' style='color:#7fd0ff;text-decoration:none;pointer-events:auto'>discord.gg/KkCjEdv9Jv</a>"; w.style.display = wm ? "flex" : "none"; document.body.appendChild(w);
  const t = document.createElement("div"); t.id = "dihToast"; document.body.appendChild(t); let tt;
  const toast = s => { t.textContent = s; t.style.opacity = 1; clearTimeout(tt); tt = setTimeout(() => (t.style.opacity = 0), 1400); };
  addEventListener("keydown", e => {
    if (e.code === "F6") { capI = (capI + 1) % CAPS.length; window.__dihCap = CAPS[capI]; SAVE("cap", capI); toast("FPS limit: " + (CAPS[capI] || "Unlimited")); }
    else if (e.code === "F7") { scaleI = (scaleI + 1) % SCALES.length; SAVE("scale", scaleI); dispatchEvent(new Event("resize")); toast("Render scale: " + SCALES[scaleI] + "x"); }
    else if (e.code === "F8") { wm = !wm; SAVE("wm", wm); w.style.display = wm ? "flex" : "none"; toast("Watermark " + (wm ? "on" : "off")); }
    else if (e.code === "F9") { localStorage.setItem("dih.lowlat", JSON.stringify(!LOWLAT)); toast("Low-latency mode " + (!LOWLAT ? "ON" : "OFF") + " — restart to apply"); }
    else return; e.preventDefault();
  }, true);
});

// --- Dih Karts logo: swap the in-game logo (it lives in a DXT5 UI atlas) while the atlas is uploaded to the GPU ---
// assets/logo.bin is built by tools/buildpatch.mjs; it only applies to the atlas build it was made from (signature check).
try {
  const fs = require("fs"), path = require("path"), bin = fs.readFileSync(path.join(__dirname, "assets", "logo.bin"));
  const SIG = bin.readUInt32LE(0), LV = {}; let o = 8;
  for (let i = 0, n = bin.readUInt32LE(4); i < n; i++) { const l = bin.readUInt32LE(o), bw = bin.readUInt32LE(o + 4), bh = bin.readUInt32LE(o + 8); LV[l] = { bw, bh, d: bin.subarray(o + 12, o + 12 + bw * bh * 16) }; o += 12 + bw * bh * 16; }
  const fnv = b => { let h = 2166136261; for (const x of b) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return h; };
  let armed = false; const P = WebGL2RenderingContext.prototype;
  const wrap = (name, wi, fi, sub) => { const orig = P[name]; P[name] = function (...a) {
    try {
      const level = a[1], w = a[wi], h = a[wi + 1], si = a.findIndex(x => ArrayBuffer.isView(x));
      if (si > 0 && a[fi] === 0x83f3 && w === 2048 >> level && h === w && (!sub || (a[2] === 0 && a[3] === 0))) {
        const src = a[si], off = a[si + 1] || 0, len = a[si + 2] || src.byteLength - off, v = new Uint8Array(src.buffer, src.byteOffset + off, len), bpr = (w / 4) * 16;
        if (level === 0) { const L = LV[0]; armed = len === 2048 * 2048 && fnv(Buffer.concat([v.subarray(0, L.bw * 16), v.subarray((L.bh - 1) * bpr, (L.bh - 1) * bpr + L.bw * 16)])) === SIG; }
        const L = armed && LV[level];
        if (L) { const c = new Uint8Array(v); for (let r = 0; r < L.bh; r++) c.set(L.d.subarray(r * L.bw * 16, (r + 1) * L.bw * 16), r * bpr); a.length = si; a[si] = c; }
      }
    } catch (e) { console.log("[dih] logo patch error", e.message); }
    return orig.apply(this, a); }; };
  wrap("compressedTexSubImage2D", 4, 6, true); wrap("compressedTexImage2D", 3, 2, false);
} catch (e) { console.log("[dih] logo patch disabled", e.message); }
