import { readdir, stat, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { readState } from "./projects.mjs";

const DEVICES = { desktop: [1440, 900], laptop: [1280, 800], tablet: [820, 1180], mobile: [390, 844] };
const GAP = 120, MAX_SCREENS = 16, W = 1280, H = 800;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Where the canvas puts the screens of a project: the saved layout, new screens flow to the right (as `addFrame` in the renderer does). */
export function framesOf(files, layout = {}) {
  const out = [];
  for (const file of files) {
    const s = layout[file] ?? {};
    const [w, h] = s.device === "custom" && s.w && s.h ? [s.w, s.h] : DEVICES[s.device] ?? DEVICES.desktop;
    const right = out.reduce((m, f) => Math.max(m, f.x + f.w), -GAP);
    out.push({ file, x: Number.isFinite(s.x) ? s.x : right + GAP, y: Number.isFinite(s.y) ? s.y : 0, w, h });
  }
  return out;
}

/**
 * The picture of a whole canvas: every screen where it lies, scaled to fit, on the dotted canvas, each with its name above.
 * A page of iframes (`urlOf(file)`); `window.__loaded` counts the iframes that have loaded.
 */
export function compositionHtml(frames, urlOf) {
  const x1 = Math.min(...frames.map((f) => f.x)), y1 = Math.min(...frames.map((f) => f.y));
  const x2 = Math.max(...frames.map((f) => f.x + f.w)), y2 = Math.max(...frames.map((f) => f.y + f.h));
  const pad = 90, k = Math.min(1, (W - 2 * pad) / (x2 - x1), (H - 2 * pad - 14) / (y2 - y1));
  const ox = (W - (x2 - x1) * k) / 2 - x1 * k, oy = (H - (y2 - y1) * k) / 2 - y1 * k + 8;
  const cells = frames.map((f) => `<div class="l" style="left:${(ox + f.x * k).toFixed(1)}px;top:${(oy + f.y * k - 17).toFixed(1)}px;max-width:${(f.w * k).toFixed(1)}px">${esc(f.file.replace(/\.html$/, ""))}</div>` +
    `<div class="f" style="left:${(ox + f.x * k).toFixed(1)}px;top:${(oy + f.y * k).toFixed(1)}px;width:${f.w}px;height:${f.h}px;transform:scale(${k.toFixed(4)})"><iframe src="${esc(urlOf(f.file))}" width="${f.w}" height="${f.h}" onload="window.__loaded=(window.__loaded||0)+1"></iframe></div>`).join("");
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}body{position:relative;background-color:#e8eaee;background-image:radial-gradient(#cfd3da 1.4px,transparent 1.4px);background-size:24px 24px;font:12px -apple-system,system-ui,sans-serif}` +
    `.f{position:absolute;transform-origin:0 0;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px #d0d4db,0 10px 30px rgba(0,0,0,.18)}.f iframe{border:0;display:block;background:#fff}` +
    `.l{position:absolute;color:#667085;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}</style>${cells}`;
}

/**
 * The picture of a project on the dashboard: its whole canvas, kept in <project>/.studio/thumb.jpg and made again only when a screen
 * or the layout changed (`thumb.json` holds a signature of both). `render(html, count)` returns a JPEG buffer (or null when nothing
 * could be painted); pictures are made one after another so several hidden windows never compete for the CDN.
 */
export function createThumbs({ projects, port, render }) {
  let chain = Promise.resolve();
  const asUrl = (buf) => `data:image/jpeg;base64,${buf.toString("base64")}`;

  async function make(name) {
    const dir = projects.dirOf(name);
    const files = (await readdir(dir)).filter((n) => n.endsWith(".html")).sort((a, b) => a.localeCompare(b, "en"));
    if (!files.length) return null;
    const layout = (await readState(dir)).layout?.frames ?? {};
    const frames = framesOf(files.slice(0, MAX_SCREENS), layout);
    const mtimes = await Promise.all(frames.map(async (f) => (await stat(path.join(dir, f.file))).mtimeMs));
    const sig = createHash("sha1").update(JSON.stringify([frames, mtimes])).digest("hex");
    const cache = path.join(dir, ".studio", "thumb.jpg"), side = path.join(dir, ".studio", "thumb.json");
    const known = await readFile(side, "utf8").then((t) => JSON.parse(t).sig).catch(() => null);
    if (known === sig) { const buf = await readFile(cache).catch(() => null); if (buf) return asUrl(buf); }
    const html = compositionHtml(frames, (f) => `http://127.0.0.1:${port}/${encodeURIComponent(name)}/${encodeURIComponent(f)}`);
    const buf = await render(html, frames.length);
    if (!buf) return null;
    await mkdir(path.dirname(cache), { recursive: true });
    await writeFile(cache, buf); await writeFile(side, JSON.stringify({ sig }));
    return asUrl(buf);
  }

  /** The picture of a project as a data URL, or null. */
  const get = (name) => { const r = chain.then(() => make(name)).catch(() => null); chain = r.then(() => {}); return r; };
  return { get };
}
