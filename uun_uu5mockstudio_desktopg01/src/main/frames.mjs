/**
 * Custom frames: environments made from a real page (Management Kit, BookKit, any web page). A frame is a folder
 *   <id>/frame.json   { label, url, offset: {top,right,bottom,left}, createdAt }
 *   <id>/frame.html   the shell around the content slot, with {{title}}, {{breadcrumb}}, {{parents}}
 *   <id>/frame.css    its styles
 * kept per project (<project>/.studio/frames/) or globally (<userData>/frames/). The environment id of a custom frame is
 * `custom:<scope>:<id>` (scope "project" or "global"); it is drawn around the page by wrapPage like the built-in shells.
 */
import fs from "node:fs";
import path from "node:path";

export const FRAME_PREFIX = "custom:";
export const SCOPES = ["project", "global"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const slug = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

export const frameEnv = (scope, id) => `${FRAME_PREFIX}${scope}:${id}`;
/** "custom:project:x" -> { scope, id }; anything else (also a path-like id) -> null. */
export function parseFrameEnv(env) {
  const m = /^custom:(project|global):([a-z0-9][a-z0-9-]*)$/.exec(String(env ?? ""));
  return m ? { scope: m[1], id: m[2] } : null;
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const num = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Math.round(Number(n)) : 0);

/** One frame of a folder, or null when it is not (completely) there. */
export function readFrame(baseDir, id) {
  if (!baseDir || !/^[a-z0-9][a-z0-9-]*$/.test(id)) return null;
  const dir = path.join(baseDir, id);
  const meta = readJson(path.join(dir, "frame.json"));
  let html;
  try { html = fs.readFileSync(path.join(dir, "frame.html"), "utf8"); } catch { return null; }
  if (!meta) return null;
  let css = ""; try { css = fs.readFileSync(path.join(dir, "frame.css"), "utf8"); } catch { /* no styles */ }
  const o = meta.offset ?? {};
  return { id, dir, label: String(meta.label || id), url: meta.url ?? null, offset: { top: num(o.top), right: num(o.right), bottom: num(o.bottom), left: num(o.left) }, html, css };
}

/** The frame an environment id names; `baseOf(scope)` gives the folder of that scope (or null). */
export function loadFrame(baseOf, env) {
  const p = parseFrameEnv(env);
  return p ? readFrame(baseOf(p.scope), p.id) : null;
}

/** All frames of both scopes as environments: [{ id: "custom:project:x", label, scope, url }]. */
export function listFrames(baseOf) {
  const out = [];
  for (const scope of SCOPES) {
    const base = baseOf(scope);
    let names = [];
    try { names = fs.readdirSync(base ?? "", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* no frames yet */ }
    for (const id of names.sort()) { const f = readFrame(base, id); if (f) out.push({ id: frameEnv(scope, id), label: f.label, scope, url: f.url }); }
  }
  return out;
}

/** Writes a frame; the id comes from the label (made unique in the folder). Returns { id, env }. */
export function saveFrame(baseDir, scope, { label, url = null, html, css = "", offset = {} }) {
  if (!SCOPES.includes(scope)) throw new Error("Unknown scope.");
  if (!String(label ?? "").trim()) throw new Error("The frame needs a name.");
  if (!String(html ?? "").trim()) throw new Error("The frame has no content.");
  const base = slug(label) || "frame";
  let id = base, n = 2;
  while (fs.existsSync(path.join(baseDir, id))) id = `${base}-${n++}`;
  const dir = path.join(baseDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "frame.json"), JSON.stringify({ label: String(label).trim(), url, offset: { top: num(offset.top), right: num(offset.right), bottom: num(offset.bottom), left: num(offset.left) }, createdAt: new Date().toISOString() }, null, 2));
  fs.writeFileSync(path.join(dir, "frame.html"), String(html));
  fs.writeFileSync(path.join(dir, "frame.css"), String(css));
  return { id, env: frameEnv(scope, id) };
}

/** Changes a frame of a folder: name, content-slot offsets, html, css (what is not given stays). */
export function updateFrame(baseDir, id, { label, url, offset, html, css } = {}) {
  const cur = readFrame(baseDir, id);
  if (!cur) throw new Error("The frame is gone.");
  if (html !== undefined && !String(html).trim()) throw new Error("The frame has no content.");
  if (label !== undefined && !String(label).trim()) throw new Error("The frame needs a name.");
  const o = { ...cur.offset, ...(offset ?? {}) };
  const dir = path.join(baseDir, id);
  fs.writeFileSync(path.join(dir, "frame.json"), JSON.stringify({ label: String(label ?? cur.label).trim(), url: url ?? cur.url, offset: { top: num(o.top), right: num(o.right), bottom: num(o.bottom), left: num(o.left) }, createdAt: readJson(path.join(dir, "frame.json"))?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2));
  if (html !== undefined) fs.writeFileSync(path.join(dir, "frame.html"), String(html));
  if (css !== undefined) fs.writeFileSync(path.join(dir, "frame.css"), String(css));
  return { id };
}

export function removeFrame(baseDir, id) {
  if (!baseDir || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("Unknown frame.");
  fs.rmSync(path.join(baseDir, id), { recursive: true, force: true });
}

const dataUrls = new Map(); // path+mtime -> data URL of a frame picture
function inlineImages(html, dir) {
  if (!dir) return html;
  return html.replace(/frame-img\/([\w.-]+\.(?:png|jpe?g|webp|svg|gif))/g, (m, name) => {
    try {
      const file = path.join(dir, "img", name), key = file + fs.statSync(file).mtimeMs;
      const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" }[name.split(".").pop().toLowerCase()] ?? "image/png";
      if (!dataUrls.has(key)) dataUrls.set(key, `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`);
      return dataUrls.get(key);
    } catch { return m; }
  });
}

/**
 * The shell of a frame for a page: variables filled in, everything marked as shell (fixed, non-interactive, never in uu5String).
 * The content slot is a scroll box of its own (#uu5 fixed to the offsets): the page scrolls inside it and never runs under the frame.
 */
export function renderFrame(frame, { title, parents = [] }) {
  const crumbs = ["…", ...parents, title].map((c) => `<span class="uu5mock-crumb">${esc(c)}</span>`).join("");
  const html = inlineImages(frame.html, frame.dir)
    .replace(/\{\{\s*title\s*\}\}/g, esc(title))
    .replace(/\{\{\s*breadcrumb\s*\}\}/g, crumbs)
    .replace(/\{\{\s*parents\s*\}\}/g, esc(parents.join(" › ")));
  const o = frame.offset;
  const css = `html,body{background:#fff!important;height:100%!important;overflow:hidden!important}
body{margin:0!important;padding:0!important}
#uu5{position:fixed!important;top:${o.top}px;left:${o.left}px;right:${o.right}px;bottom:${o.bottom}px;max-width:none!important;margin:0!important;overflow:auto!important;box-sizing:border-box}
.uu5mock-frame{position:fixed;inset:0;z-index:2147483000;pointer-events:none}
[data-uu5mock-shell]{pointer-events:none}
.uu5mock-crumb+.uu5mock-crumb:before{content:"›";margin:0 6px;opacity:.6}
${inlineImages(frame.css, frame.dir)}`;
  return `<style data-uu5mock-shell>${css}</style><div class="uu5mock-frame" data-uu5mock-shell>${html}</div>`;
}
