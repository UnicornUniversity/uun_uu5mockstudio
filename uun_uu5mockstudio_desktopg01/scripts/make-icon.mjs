// Renders build/icon.svg to build/icon.png (1024x1024) with Electron itself: `npx electron scripts/make-icon.mjs`
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const build = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../build");
app.whenReady().then(async () => {
  const svg = readFileSync(path.join(build, "icon.svg"), "utf8");
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  writeFileSync(path.join(build, "icon.png"), img.resize({ width: 1024, height: 1024 }).toPNG());
  app.quit();
});
