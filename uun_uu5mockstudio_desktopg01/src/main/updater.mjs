import { existsSync } from "node:fs";
import path from "node:path";
import electronUpdater from "electron-updater";

/**
 * Auto-update through electron-updater. It is only active in a packaged build that was published with a feed
 * (electron-builder writes resources/app-update.yml when UU5STUDIO_UPDATE_URL is set at build time).
 */
export function setupUpdater({ app, emit }) {
  const enabled = app.isPackaged && existsSync(path.join(process.resourcesPath, "app-update.yml"));
  if (!enabled) return { enabled, check: async () => ({ status: "disabled" }), install: () => {} };

  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (i) => emit("update:event", { type: "available", version: i.version }));
  autoUpdater.on("update-not-available", () => emit("update:event", { type: "none" }));
  autoUpdater.on("download-progress", (p) => emit("update:event", { type: "progress", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (i) => emit("update:event", { type: "ready", version: i.version }));
  autoUpdater.on("error", (e) => emit("update:event", { type: "error", message: String(e?.message ?? e).split("\n")[0] }));

  return {
    enabled,
    check: async () => { try { await autoUpdater.checkForUpdates(); return { status: "checking" }; } catch (e) { return { status: "error", message: e.message }; } },
    install: () => autoUpdater.quitAndInstall(),
  };
}
