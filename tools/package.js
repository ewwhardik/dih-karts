// node tools/package.js  ->  dist/DihKarts (portable, trimmed) + dist/DihKarts-win-x64.zip
const fs = require("fs"), path = require("path"), cp = require("child_process"), asar = require("@electron/asar");
const root = path.join(__dirname, ".."), out = path.join(root, "dist", "DihKarts"), ed = path.join(root, "node_modules", "electron", "dist");
fs.rmSync(path.join(root, "dist"), { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
fs.cpSync(ed, out, { recursive: true });
for (const f of ["LICENSES.chromium.html", "dxcompiler.dll", "dxil.dll", "vulkan-1.dll", "vk_swiftshader.dll", "vk_swiftshader_icd.json"]) fs.rmSync(path.join(out, f), { force: true });
for (const l of fs.readdirSync(path.join(out, "locales"))) if (l !== "en-US.pak") fs.rmSync(path.join(out, "locales", l));
fs.renameSync(path.join(out, "electron.exe"), path.join(out, "Dih Karts.exe")); fs.rmSync(path.join(out, "resources", "default_app.asar"), { force: true });
const app = path.join(root, "dist", "_app"); fs.mkdirSync(app, { recursive: true });
for (const f of ["main.js", "preload.js", "package.json", "assets"]) fs.cpSync(path.join(root, f), path.join(app, f), { recursive: true });
const deps = cp.execSync("npm ls --omit=dev --all --parseable", { cwd: root }).toString().trim().split(/\r?\n/).slice(1);
for (const d of deps) { const rel = path.relative(root, d); if (rel.startsWith("node_modules") && !/node_modules.(electron|@electron)/.test(rel)) fs.cpSync(d, path.join(app, rel), { recursive: true, filter: s => !/\.(map|md|ts)$/.test(s) || /\.d\.ts$/.test(s) === false && !/\.ts$/.test(s) }); }
asar.createPackage(app, path.join(out, "resources", "app.asar")).then(() => {
  fs.rmSync(app, { recursive: true, force: true });
  cp.execFileSync("C:/Windows/System32/tar.exe", ["-a", "-cf", "DihKarts-win-x64.zip", "DihKarts"], { cwd: path.join(root, "dist") });
  console.log("done", (fs.statSync(path.join(root, "dist", "DihKarts-win-x64.zip")).size / 1e6).toFixed(1) + " MB zip");
});
