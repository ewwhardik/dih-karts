// Minimal Discord Rich Presence over the local IPC pipe (Windows named pipe / unix socket). No dependencies.
const net = require("net"), os = require("os"), path = require("path");
const CLIENT_ID = "1571976706519080990"; // "Dih Karts" Discord application (public id; no token is needed or shipped)
const INVITE = "https://discord.gg/KkCjEdv9Jv", SITE = "https://ewwhardik.github.io/dih-karts/";

const pipePath = i => process.platform === "win32" ? `\\\\.\\pipe\\discord-ipc-${i}` : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || os.tmpdir(), `discord-ipc-${i}`);
const frame = (op, data) => { const j = Buffer.from(JSON.stringify(data)), h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(j.length, 4); return Buffer.concat([h, j]); };

function start(version) {
  const startedAt = Math.floor(Date.now() / 1000); let sock, ready = false, stopped = false, nonce = 0, tries = 0;
  const activity = () => ({
    details: "Racing in Dih Karts", state: "Uncapped FPS • Ad-free",
    timestamps: { start: startedAt },
    assets: { large_image: "https://ewwhardik.github.io/dih-karts/assets/icon.png", large_text: `Dih Karts v${version} by ewwhardik` },
    buttons: [{ label: "Join Discord", url: INVITE }, { label: "Download Dih Karts", url: SITE }],
  });
  const retry = () => { ready = false; if (!stopped) setTimeout(connect, 15000); };
  function connect() {
    // Discord listens on discord-ipc-0..9; try each until one accepts
    const i = tries++ % 10; const s = net.createConnection(pipePath(i)); sock = s; let buf = Buffer.alloc(0);
    s.on("connect", () => s.write(frame(0, { v: 1, client_id: CLIENT_ID })));
    s.on("data", d => { buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) { const len = buf.readInt32LE(4); if (buf.length < 8 + len) break; let m; try { m = JSON.parse(buf.subarray(8, 8 + len)); } catch {} buf = buf.subarray(8 + len);
        if (m && m.evt === "READY") { ready = true; tries = 0; s.write(frame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: activity() }, nonce: String(++nonce) })); } } });
    s.on("error", () => { if (tries % 10) connect(); else retry(); }); // next pipe, or wait before trying again
    s.on("close", () => { if (ready) retry(); });
  }
  connect();
  return { stop() { stopped = true; try { sock && sock.destroy(); } catch {} } };
}
module.exports = { start };
