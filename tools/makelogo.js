// electron tools/makelogo.js <out.png> : draws the "DIH" half of the Dih Karts logo (740x340, upright, transparent)
const { app, BrowserWindow } = require("electron"); const fs = require("fs");
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } }); await w.loadURL("about:blank");
  const url = await w.webContents.executeJavaScript(`(() => {
    const c = document.createElement("canvas"); c.width = 740; c.height = 340; const x = c.getContext("2d");
    const draw = (fn) => { x.save(); x.translate(440, 112); x.transform(1, 0, -0.22, 1, 0, 0); x.scale(1.5, 1); x.font = "900 150px 'Arial Black', Impact, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round"; fn(); x.restore(); };
    const T = "DIH";
    draw(() => { x.letterSpacing = "6px"; x.lineWidth = 34; x.strokeStyle = "#0b0b10"; x.strokeText(T, 0, 0); });
    draw(() => { x.letterSpacing = "6px"; x.lineWidth = 12; x.strokeStyle = "#a9dcff"; x.strokeText(T, 0, 0); });
    draw(() => { x.letterSpacing = "6px"; const g = x.createLinearGradient(0, -75, 0, 75); g.addColorStop(0, "#43b0ff"); g.addColorStop(0.52, "#2f93ec"); g.addColorStop(0.52, "#1f6fcf"); g.addColorStop(1, "#1458b3"); x.fillStyle = g; x.fillText(T, 0, 0); });
    return c.toDataURL("image/png");
  })()`);
  fs.writeFileSync(process.argv[process.argv.length - 1], Buffer.from(url.split(",")[1], "base64")); app.quit();
});
