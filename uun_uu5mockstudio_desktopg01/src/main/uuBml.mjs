import fs from "node:fs";

/**
 * The uuBml icon font: its icons (`uubml-wrench`, `uubmlicon-...`) and the state icons (`uubml-state-s02-active`: the state number
 * s00 ... s98 and the kind of state, which gives the colour) are read from the stylesheet of the font on the Plus4U CDN, the same one
 * the mockup page loads. It is cached on disk; when the CDN is not reachable the cache is used, and for the states a built-in list
 * (the numbers and kinds the stylesheet has today). The icon list has no built-in copy: it appears once the stylesheet was read.
 */
export const BML_BASE = "https://cdn.plus4u.net/uu-uubmldraw-iconsg03/2.0.0/";
export const BML_CSS = "uu_uubmldraw_iconsg03.min.css";
const BUILTIN = {
  numbers: Array.from({ length: 99 }, (_, i) => String(i).padStart(2, "0")),
  kinds: ["initial", "active", "alternative-active", "problem", "final", "alternative-final", "passive", "system", "cancelled"],
};

const GROUPS = ["uuBml", "App icons", "Labels"];
/** The icons of the font: [{ code, name, group }] (the state icons are a palette of their own and are not listed here). */
export function parseIcons(css) {
  const codes = [...new Set([...String(css ?? "").matchAll(/\[class\*=(uubml(?:icon)?-[a-z0-9-]+)\]/g)].map((m) => m[1]))]
    .filter((c) => !c.startsWith("uubml-state-") && !c.endsWith("-"));
  return codes.map((code) => ({ code, name: code.replace(/^uubml(icon)?-/, ""), group: code.startsWith("uubmlicon-") ? "App icons" : code.startsWith("uubml-label-") ? "Labels" : "uuBml" }))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
}

/** { numbers: ["00", ...], variants: ["", "default", "initial", ...], icons } from the stylesheet text, or null when it has no state icons. */
export function parseBml(css) {
  const text = String(css ?? "");
  const numbers = [...new Set([...text.matchAll(/uubml-state-s(\d{2})\b/g)].map((m) => m[1]))].sort();
  if (!numbers.length) return null;
  const kinds = [...new Set([...text.matchAll(/\[class\*=uubml-state-\]\[class\*=-([a-z-]+)\]/g)].map((m) => m[1]))];
  return { numbers, variants: ["", "default", ...(kinds.length ? kinds : BUILTIN.kinds)], icons: parseIcons(text) };
}

/** `fetchText(url)` resolves the stylesheet text. Returns { cssUrl, base, numbers, variants, icons, source } (source: cdn | cache | builtin). */
export async function loadBml({ fetchText, cacheFile, base = BML_BASE }) {
  const cssUrl = base + BML_CSS, done = (states, source) => ({ cssUrl, base, ...states, source });
  try {
    const states = parseBml(await fetchText(cssUrl));
    if (states) { try { if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(states)); } catch { /* the cache is optional */ } return done(states, "cdn"); }
  } catch { /* offline, blocked, ... */ }
  try { const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")); if (cached?.numbers?.length && cached?.variants?.length) return done({ ...cached, icons: cached.icons ?? [] }, "cache"); } catch { /* no cache yet */ }
  return done({ numbers: BUILTIN.numbers, variants: ["", "default", ...BUILTIN.kinds], icons: [] }, "builtin");
}
