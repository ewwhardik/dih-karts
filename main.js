const { app, BrowserWindow, protocol, net, session } = require("electron");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const rpc = require("./rpc"), VERSION = require("./package.json").version, PATCH_REV = "r3"; // bump PATCH_REV when the framework/wasm patches change
// --- performance: lift Chromium's 60fps/vsync cap, keep the GPU busy, never throttle ---
for (const f of ["disable-frame-rate-limit", "disable-gpu-vsync", "ignore-gpu-blocklist", "enable-gpu-rasterization", "enable-zero-copy", "disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows", "enable-quic", "disable-background-networking", "no-pings", "disable-ipc-flooding-protection", "disable-hang-monitor"]) app.commandLine.appendSwitch(f);
app.commandLine.appendSwitch("use-angle", "d3d11");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion,IntensiveWakeUpThrottling");
if (!app.requestSingleInstanceLock()) app.quit();

// --- patch the Unity build in flight ---
// 1) framework: force uncapped rAF main-loop timing
const TIMING = "function _emscripten_set_main_loop_timing(mode,value){";
function patchFramework(js) {
  if (!js.includes(TIMING)) { console.log("[dih] framework patch target missing"); return js; }
  const COND = "if(Browser.mainLoop.timingMode==1&&Browser.mainLoop.timingValue>1&&", ITER = "Browser.mainLoop.runIter(browserIterationFunc);if(!checkIsRunning())return;if(typeof SDL";
  if (js.includes(COND) && js.includes(ITER)) // optional frame limiter (F6); window.__dihCap = fps or 0
    js = js.replace(COND, "if((window.__dihCap&&performance.now()-(window.__dihLast||0)<1000/window.__dihCap-1)||" + COND.slice(3)).replace(ITER, "window.__dihLast=performance.now();" + ITER);
  return js.replace(TIMING, TIMING + "if(window.__dihUncap){mode=1;value=1}");
}
// 2) wasm: the game's own FPS counter does fps=min(fps, targetFrameRate==-1 ? 60 : targetFrameRate).
//    Change that 60 (i32.const 60 -> i32.const 8000) so the in-game counter shows the real frame rate.
const leb = n => { const o = []; do { let x = n & 127; n >>>= 7; if (n) x |= 128; o.push(x); } while (n); return Buffer.from(o); };
function patchWasm(b) {
  const K = Buffer.from([0x43, 0x0a, 0xd7, 0x23, 0x3c]), IF60 = Buffer.from([0x04, 0x7f, 0x41, 0x3c, 0x05]); // f32.const 0.01 ... if(i32) 60 else
  let p = 8; const rd = () => { let r = 0, s = 0, x; do { x = b[p++]; r |= (x & 127) << s; s += 7; } while (x & 128); return r >>> 0; };
  while (p < b.length) {
    const id = b[p++], size = rd(), end = p + size;
    if (id === 10) {
      const secStart = p - 1 - leb(size).length, cnt = rd(), parts = [leb(cnt)]; let hit = false;
      for (let i = 0; i < cnt; i++) {
        const bs = p, sz = rd(), bodyStart = p, e = bodyStart + sz, body = b.subarray(bodyStart, e);
        const k = !hit && sz < 600 ? body.indexOf(K) : -1, q = k >= 0 ? body.indexOf(IF60, k) : -1;
        if (q >= 0 && q - k < 300) { hit = true; const nb = Buffer.concat([body.subarray(0, q + 2), Buffer.from([0x41, 0xc0, 0x3e]), body.subarray(q + 4)]); parts.push(leb(nb.length), nb); }
        else parts.push(b.subarray(bs, e));
        p = e;
      }
      if (!hit) { console.log("[dih] wasm FPS patch target missing"); return b; }
      const sec = Buffer.concat(parts);
      return Buffer.concat([b.subarray(0, secStart), Buffer.from([10]), leb(sec.length), sec, b.subarray(end)]);
    }
    p = end;
  }
  return b;
}

app.setAppUserModelId("com.dihclients.dihkarts");
app.whenReady().then(async () => {
  const ses = session.defaultSession;
  const cacheDir = path.join(app.getPath("userData"), "patched"); fs.mkdirSync(cacheDir, { recursive: true });
  protocol.handle("https", async req => {
    const pn0 = new URL(req.url).pathname;
    if (req.url.startsWith("https://smashkarts.io/") && /\/images\/(smashkarts|favicon)\.png$/.test(pn0)) return new Response(fs.readFileSync(path.join(__dirname, "assets", "dihkarts.png")), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
    const fw = /\.framework\.js(\.br)?$/.test(pn0), wa = /\.wasm(\.br)?$/.test(pn0);
    if (!fw && !wa) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    // The patched framework/wasm are cached on disk (file names carry the build hash), so launches skip the 50 MB download + patch.
    const cf = path.join(cacheDir, crypto.createHash("sha1").update(PATCH_REV + req.url).digest("hex") + (fw ? ".js" : ".wasm"));
    const type = fw ? "application/javascript" : "application/wasm", hdr = { "content-type": type, "cache-control": "public, max-age=31536000, immutable" };
    try { return new Response(await fs.promises.readFile(cf), { headers: hdr }); } catch {}
    const res = await net.fetch(req, { bypassCustomProtocolHandlers: true });
    if (!res.ok) return res;
    const body = fw ? Buffer.from(patchFramework(await res.text())) : patchWasm(Buffer.from(await res.arrayBuffer()));
    fs.promises.writeFile(cf, body).catch(() => {});
    return new Response(body, { status: res.status, headers: hdr });
  });

  // --- networking: DoH + connection warm-up ---
  app.configureHostResolver({ secureDnsMode: "automatic", secureDnsServers: ["https://cloudflare-dns.com/dns-query", "https://dns.google/dns-query"] });
  for (const u of ["https://smashkarts.io", "https://cdn.tall.team"]) ses.preconnect({ url: u, numSockets: 4 });

  // --- adblock (Ghostery engine, cached on disk) ---
  try {
    const { ElectronBlocker } = require("@ghostery/adblocker-electron"), fetch = require("cross-fetch");
    const cache = path.join(app.getPath("userData"), "adblock.bin");
    const blocker = await ElectronBlocker.fromLists(fetch, ["https://easylist.to/easylist/easylist.txt", "https://easylist.to/easylist/easyprivacy.txt", "https://secure.fanboy.co.nz/fanboy-annoyance.txt"], { enableCompression: true }, { path: cache, read: fs.promises.readFile, write: fs.promises.writeFile });
    blocker.enableBlockingInSession(ses);
  } catch (e) { console.log("[dih] adblock unavailable:", e.message); }

  const stateFile = path.join(app.getPath("userData"), "window.json"); let st = {}; try { st = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch {}
  const w = new BrowserWindow({ width: st.width || 1280, height: st.height || 720, x: st.x, y: st.y, backgroundColor: "#0c2f6b", autoHideMenuBar: true, title: "Dih Karts", icon: path.join(__dirname, "assets", "icon.ico"), webPreferences: { backgroundThrottling: false, contextIsolation: false, sandbox: false, preload: path.join(__dirname, "preload.js") } });
  if (st.max) w.maximize(); if (st.full) w.setFullScreen(true);
  const save = () => { try { const b = w.getNormalBounds(); fs.writeFileSync(stateFile, JSON.stringify({ ...b, max: w.isMaximized(), full: w.isFullScreen() })); } catch {} };
  w.on("close", save);
  w.on("page-title-updated", e => { e.preventDefault(); w.setTitle("Dih Karts"); });
  w.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    if (i.key === "F11") { w.setFullScreen(!w.isFullScreen()); e.preventDefault(); }
    else if (i.key === "F5") { w.reload(); e.preventDefault(); }
    else if (i.control && i.shift && i.key.toLowerCase() === "i") w.webContents.toggleDevTools();
  });
  w.webContents.setWindowOpenHandler(({ url }) => { // in-game + page links; every SmashKarts Discord link goes to ours
    if (/^https?:\/\/([^/]*\.)?(discord\.gg|discord\.com|discordapp\.com)\//i.test(url)) url = "https://discord.gg/KkCjEdv9Jv";
    if (/^https:/.test(url)) require("electron").shell.openExternal(url); return { action: "deny" }; });
  await ses.clearStorageData({ storages: ["serviceworkers", "cachestorage"] });
  const presence = rpc.start(VERSION); app.on("before-quit", () => presence.stop());
  w.loadURL("https://smashkarts.io/");
});
