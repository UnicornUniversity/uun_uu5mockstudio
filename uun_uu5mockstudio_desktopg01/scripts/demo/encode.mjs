// Encodes a recorded frame sequence into an MP4 with Electron's own MediaRecorder (no ffmpeg needed).
// usage: electron scripts/demo/encode.mjs <manifest.json> <out.mp4>
// manifest: { width, height, fps, frames: [{t, file}], segments: [{from, to, speed}], end }   (t, from, to, end in ms since the recording started)
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";

const [manifestPath, outPath] = process.argv.slice(2);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const win = new BrowserWindow({ show: false, width: manifest.width, height: manifest.height, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  await win.loadURL("data:text/html,<canvas id=c></canvas>");
  fs.writeFileSync(outPath, "");
  ipcMain.on("chunk", (_e, buf) => fs.appendFileSync(outPath, Buffer.from(buf)));
  ipcMain.on("progress", (_e, p) => process.stdout.write(`\rencoding ${Math.round(p * 100)}%`));
  const result = await win.webContents.executeJavaScript(`(${encodeInPage})(${JSON.stringify(manifest)})`);
  process.stdout.write(`\nwrote ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB, ${result.seconds.toFixed(1)} s)\n`);
  app.quit();
});

// runs inside the hidden window
async function encodeInPage(m) {
  const { ipcRenderer } = require("electron");
  const canvas = document.getElementById("c"); canvas.width = m.width; canvas.height = m.height;
  const ctx = canvas.getContext("2d");
  const segs = [...m.segments].sort((a, b) => a.from - b.from);
  // source time for a given output time (ms): normal speed except inside the fast-forward segments
  const plan = []; let src = 0;
  for (const s of segs) { if (s.from > src) plan.push({ from: src, to: s.from, speed: 1 }); plan.push({ from: Math.max(s.from, src), to: s.to, speed: s.speed }); src = s.to; }
  if (src < m.end) plan.push({ from: src, to: m.end, speed: 1 });
  const total = plan.reduce((a, p) => a + (p.to - p.from) / p.speed, 0);
  const at = (out) => { for (const p of plan) { const len = (p.to - p.from) / p.speed; if (out <= len) return p.from + out * p.speed; out -= len; } return m.end; };
  const fs = require("fs"); // the helper window has Node integration: read the frames from disk directly
  const load = async (f) => createImageBitmap(new Blob([fs.readFileSync(f)]));
  const stream = canvas.captureStream(m.fps);
  const rec = new MediaRecorder(stream, { mimeType: "video/mp4;codecs=avc1.42E01E", videoBitsPerSecond: 8_000_000 });
  rec.ondataavailable = async (e) => { if (e.data.size) ipcRenderer.send("chunk", new Uint8Array(await e.data.arrayBuffer())); };
  let idx = -1, bitmap = null, next = null;
  const frameAt = (t) => { let i = idx; while (i + 1 < m.frames.length && m.frames[i + 1].t <= t) i++; return i; };
  rec.start(1000);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = async () => {
      const out = performance.now() - t0;
      if (out >= total) return resolve();
      const i = frameAt(at(out));
      if (i !== idx && i >= 0) { idx = i; bitmap = next && next.i === i ? next.b : await load(m.frames[i].file); }
      if (bitmap) ctx.drawImage(bitmap, 0, 0, m.width, m.height);
      if (idx + 1 < m.frames.length && (!next || next.i !== idx + 1)) { const j = idx + 1; load(m.frames[j].file).then((b) => { next = { i: j, b }; }); } // preload the next frame
      if (Math.round(out) % 500 < 40) ipcRenderer.send("progress", out / total);
      setTimeout(tick, 1000 / m.fps);
    };
    tick();
  });
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  return { seconds: total / 1000 };
}
