import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The uuGDS icon catalog (names, categories, keywords, the convention table "action -> icon") from the user's own `uugds`
 * Claude Code plugin (skill uugds-icons). Nothing is copied; without the plugin the icon picker is simply not offered.
 */
export function findIconsDir({ pluginsFile = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json") } = {}) {
  try {
    const reg = JSON.parse(fs.readFileSync(pluginsFile, "utf8")).plugins ?? {};
    for (const [key, installs] of Object.entries(reg)) {
      if (!/^uugds@/.test(key)) continue;
      for (const inst of [...installs].reverse()) {
        const dir = path.join(inst.installPath, "skills", "uugds-icons", "data");
        if (fs.existsSync(path.join(dir, "icons.json"))) return dir;
      }
    }
  } catch { /* plugin registry missing */ }
  return null;
}

export function loadIcons(dir = findIconsDir()) {
  if (!dir) return null;
  try {
    const icons = JSON.parse(fs.readFileSync(path.join(dir, "icons.json"), "utf8")).icons.map((i) => ({
      code: i.fullCode, name: i.name, keywords: i.keywords ?? [], category: i.category, common: Boolean(i.isCommon), deprecated: Boolean(i.deprecated),
    }));
    let actions = {};
    try { actions = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(dir, "conventions.json"), "utf8")).actions ?? {}).filter(([, v]) => v?.icon).map(([k, v]) => [k, v.icon])); } catch { /* no conventions */ }
    return { icons, actions };
  } catch { return null; }
}
