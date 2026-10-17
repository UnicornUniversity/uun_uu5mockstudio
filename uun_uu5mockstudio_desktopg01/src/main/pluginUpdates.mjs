import fs from "node:fs";
import path from "node:path";
import { compareVersions } from "./prerequisites.mjs";

const SIX_HOURS = 6 * 3600 * 1000;

/** Is it time to refresh the marketplace again? (a manual check always is) */
export const shouldCheck = (lastCheckAt, now = Date.now(), force = false) => force || !lastCheckAt || now - lastCheckAt >= SIX_HOURS;

/** Version a plugin has in the marketplace folder: its manifest, or the marketplace catalog entry. null when neither says. */
export function latestVersion(installLocation, name) {
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const own = readJson(path.join(installLocation, "plugins", name, ".claude-plugin", "plugin.json"))?.version;
  if (own) return String(own);
  const entry = readJson(path.join(installLocation, ".claude-plugin", "marketplace.json"))?.plugins?.find((p) => p.name === name);
  return entry?.version ? String(entry.version) : null;
}

/** [{ name, id, installed, latest }] for the plugins whose marketplace version is newer than the installed one and has not been postponed. */
export function findUpdates(states, installLocation, { later = {} } = {}) {
  const out = [];
  for (const s of states) {
    if (!s.version || s.state === "missing") continue;
    const latest = latestVersion(installLocation, s.name);
    if (latest && compareVersions(s.version, latest) < 0 && later[s.id] !== latest) out.push({ name: s.name, id: s.id, installed: s.version, latest });
  }
  return out;
}
