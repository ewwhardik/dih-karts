// electron tools/makeclients.js <out.png> : white "DIH / CLIENTS" wordmark (256x144, upright, transparent) that replaces the "Tall Team" logo
const { app, BrowserWindow } = require("electron"); const fs = require("fs");
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false }); await w.loadURL("about:blank");
  const url = await w.webContents.executeJavaScript(`(() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 144; const x = c.getContext("2d");
    const line = (t, y, h) => { x.font = "900 " + h + "px 'Arial Black', Impact, sans-serif"; const mw = x.measureText(t).width, s = Math.min(1, 236 / mw); x.save(); x.translate(128, y); x.transform(1, 0, -0.18, 1, 0, 0); x.scale(s, 1); x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round";
      x.lineWidth = 9; x.strokeStyle = "rgba(60,80,120,.85)"; x.strokeText(t, 3, 3); x.fillStyle = "#fff"; x.fillText(t, 0, 0); x.restore(); };
    line("DIH", 42, 70); line("CLIENTS", 104, 46); return c.toDataURL("image/png"); })()`);
  fs.writeFileSync(process.argv[process.argv.length - 1], Buffer.from(url.split(",")[1], "base64")); app.quit();
});
