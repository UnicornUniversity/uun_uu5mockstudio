import fs from "node:fs";

/**
 * The Material Design Icons catalog for the icon picker: the icons of the version the mockups load (the Plus4U CDN stylesheet), with the
 * aliases and categories (tags) of the @mdi/svg metadata for searching. Fetched once and cached in the app data; without the metadata the
 * picker still lists the names. Nothing is bundled.
 */
export const MDI_VERSION = "7.0.96";
export const MDI_CSS = `https://cdn.plus4u.net/libs/materialdesignicons/${MDI_VERSION}/css/materialdesignicons.min.css`;
export const MDI_META = `https://cdn.jsdelivr.net/npm/@mdi/svg@${MDI_VERSION}/meta.json`;

/** `.mdi-account-group-outline::before` -> "account-group-outline", in the order of the stylesheet, without duplicates. */
export function namesFromCss(css) {
  return [...new Set([...String(css).matchAll(/\.mdi-([a-z0-9-]+)::?before/g)].map((m) => m[1]))];
}

/** The catalog entries (the shape of the uuGDS catalog): code, name, keywords (aliases), category (first tag), version it appeared in. */
export function catalogFrom(css, meta = []) {
  const byName = new Map((Array.isArray(meta) ? meta : []).map((m) => [m.name, m]));
  const icons = namesFromCss(css).map((name) => {
    const m = byName.get(name);
    return { code: `mdi-${name}`, name, keywords: [...(m?.aliases ?? []), ...(m?.tags ?? [])], category: m?.tags?.[0] ?? "Other", since: m?.version ?? null };
  });
  return { version: MDI_VERSION, cssUrl: MDI_CSS, icons };
}

/** `{ version, cssUrl, icons }` or null. `fetchText(url)` rejects on failure; the cache is used when it has the same version. */
export async function loadMdi({ fetchText, cacheFile }) {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (c?.version === MDI_VERSION && c.icons?.length) return c;
  } catch { /* no cache yet */ }
  let css;
  try { css = await fetchText(MDI_CSS); } catch { return null; }
  let meta = [];
  try { meta = JSON.parse(await fetchText(MDI_META)); } catch { /* names only */ }
  const cat = catalogFrom(css, meta);
  if (!cat.icons.length) return null;
  try { fs.writeFileSync(cacheFile, JSON.stringify(cat)); } catch { /* not cached */ }
  return cat;
}
