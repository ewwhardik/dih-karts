// electron tools/makeicon.js : assets/icon.png (512) from assets/dihkarts.png on a Smash-Karts-blue rounded square
const { app, BrowserWindow } = require("electron"); const fs = require("fs"), path = require("path");
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false }); await w.loadURL("about:blank");
  const logo = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "assets", "dihkarts.png")).toString("base64");
  const url = await w.webContents.executeJavaScript(`new Promise(res => { const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, "#3a8cf0"); g.addColorStop(1, "#0d3a8a");
    x.beginPath(); x.roundRect(8, 8, 496, 496, 110); x.fillStyle = g; x.fill(); x.lineWidth = 12; x.strokeStyle = "#0b1e4a"; x.stroke();
    x.save(); x.clip(); x.fillStyle = "rgba(255,255,255,.10)"; x.fillRect(0, 0, 512, 200); x.restore();
    const i = new Image(); i.onload = () => { const s = 470 / i.width; x.drawImage(i, 21, 256 - i.height * s / 2 + 6, i.width * s, i.height * s); res(c.toDataURL("image/png")); }; i.src = "${logo}"; })`);
  fs.writeFileSync(path.join(__dirname, "..", "assets", "icon.png"), Buffer.from(url.split(",")[1], "base64")); app.quit();
});
