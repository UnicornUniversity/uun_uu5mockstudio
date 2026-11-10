import dns from "node:dns/promises";
import net from "node:net";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { saveAssets, sniff, MAX_BYTES } from "./attachments.mjs";
import { sitemapLocs } from "../renderer/siteStructure.js";

const UA = "Mozilla/5.0 (compatible; uu5MockStudio)";
const IMG_EXT = /\.(?:png|jpe?g|gif|webp|svg)(?:[?#]|$)/i;

/** Addresses a download must never reach (the user's own machine and network). */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

/** Throws unless `url` is an http(s) address of a public host. */
export async function checkPublicUrl(url, { lookup = (h) => dns.lookup(h, { all: true }) } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`Not a valid address: ${url}`); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) addresses can be downloaded.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host) ? [host] : (await lookup(host).catch(() => { throw new Error(`The host ${host} cannot be found.`); })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivateAddress)) throw new Error("This address is not on the public internet, so it is not downloaded.");
  return u;
}

/** GET with a limit on the size and the time; every redirect is checked again. */
async function get(url, { fetchImpl = fetch, max, check = checkPublicUrl } = {}) {
  let cur = url;
  for (let i = 0; i < 5; i++) {
    const u = await check(cur);
    const res = await fetchImpl(u.href, { redirect: "manual", signal: AbortSignal.timeout(30000), headers: { "user-agent": UA, accept: "text/html,image/*,*/*;q=0.8" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) { cur = new URL(res.headers.get("location"), u).href; continue; }
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    const len = Number(res.headers.get("content-length"));
    if (len > max) throw new Error(`The file is larger than ${Math.round(max / 1048576)} MB.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) throw new Error(`The file is larger than ${Math.round(max / 1048576)} MB.`);
    return { buf, url: u.href, type: String(res.headers.get("content-type") ?? "") };
  }
  throw new Error("Too many redirects.");
}

/**
 * The addresses of the sitemap.xml of the site of `pageUrl` (an index of sitemaps is followed one level, the first `maxFiles` of them); [] when the
 * site has none. Best effort: every file goes through the same checks as a download (public host, size, redirects).
 */
export async function listSitemapUrls(pageUrl, { maxUrls = 500, maxFiles = 3, parse = sitemapLocs, ...opts } = {}) {
  const text = async (url) => (await get(url, { max: 5 * 1048576, ...opts })).buf.toString("utf8");
  try {
    const first = parse(await text(new URL("/sitemap.xml", pageUrl).href));
    if (!first.index) return first.urls.slice(0, maxUrls);
    const out = [];
    for (const u of first.urls.slice(0, maxFiles)) { try { out.push(...parse(await text(u)).urls); } catch { /* this part stays out */ } if (out.length >= maxUrls) break; }
    return out.slice(0, maxUrls);
  } catch { return []; }
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const attr = (tag, name) => decode(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(2).find((x) => x !== undefined) ?? "");
const bestOfSrcset = (set) => { // the candidate with the biggest width (or density)
  let best = null, w = -1;
  for (const part of set.split(",")) { const [u, d] = part.trim().split(/\s+/); const n = d ? parseFloat(d) || 1 : 1; if (u && n > w) { best = u; w = n; } }
  return best;
};

/** The pictures a page shows: [{ url, alt }] from <img>, <source srcset>, og:image and CSS url(); logos and icons are not filtered out. */
export function imagesOfHtml(html, base) {
  const out = new Map();
  const add = (raw, alt = "") => {
    if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return;
    let u; try { u = new URL(raw, base).href; } catch { return; }
    if (!/^https?:/.test(u) || (!IMG_EXT.test(u) && !alt && out.size > 200)) return;
    if (!out.has(u) || (alt && !out.get(u))) out.set(u, alt);
  };
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const alt = attr(tag, "alt") || attr(tag, "title");
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    add((srcset && bestOfSrcset(srcset)) || attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "src"), alt);
  }
  for (const [tag] of html.matchAll(/<source\b[^>]*>/gi)) { const s = attr(tag, "srcset"); if (s) add(bestOfSrcset(s)); }
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) if (/og:image|twitter:image/i.test(tag)) add(attr(tag, "content"));
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) if (IMG_EXT.test(m[1])) add(decode(m[1]));
  return [...out].map(([url, alt]) => ({ url, alt }));
}

/** Pictures of the page at `url`: the page's own text is the only thing read. */
export async function listWebImages(url, opts = {}) {
  const r = await get(url, { ...opts, max: 3 * 1024 * 1024 });
  return imagesOfHtml(r.buf.toString("utf8"), r.url).slice(0, 80);
}

/** Downloads the picture at `url` into <project>/assets (a name is made from `name`, an earlier file is never overwritten). Returns the relative path. */
export async function downloadWebImage(projectDir, url, name, { access, ...opts } = {}) {
  // `access` = a fetch with the sign-ins of the user (the preview session of the app): tried when the plain download is refused or gives no picture (a page of a login instead)
  const isPicture = (x) => sniff(x.buf) || /image\/svg\+xml/i.test(x.type) || /\.svg(?:[?#]|$)/i.test(x.url);
  let r = await get(url, { ...opts, max: MAX_BYTES }).catch((e) => { if (!access) throw e; return null; });
  if (access && (!r || !isPicture(r))) r = await get(url, { ...opts, fetchImpl: access, max: MAX_BYTES });
  const mime = sniff(r.buf) ?? (/image\/svg\+xml/i.test(r.type) || /\.svg(?:[?#]|$)/i.test(r.url) ? "image/svg+xml" : null);
  if (!mime) throw new Error("The address is not a picture (PNG, JPEG, GIF, WebP or SVG).");
  const [file] = await saveAssets(projectDir, [{ mime, data: r.buf.toString("base64"), name: name || new URL(r.url).pathname }]);
  return file;
}

/**
 * A picture of a document the app downloaded (<project>/.studio/sources/assets/<file>, listed in the snapshot of the document) copied into
 * <project>/assets, so a screen can use it. `file` is its name or its path; only files of that folder. Returns the relative path.
 */
export async function copySourcePicture(projectDir, file, name) {
  const base = path.join(projectDir, ".studio", "sources", "assets"), abs = path.join(base, path.basename(String(file ?? "")));
  if (path.dirname(abs) !== base || (path.isAbsolute(String(file)) && path.resolve(String(file)) !== abs)) throw new Error("Not a picture of a document read into this project.");
  const buf = await readFile(abs).catch(() => { throw new Error(`There is no picture ${path.basename(abs)} in .studio/sources/assets.`); });
  const mime = sniff(buf) ?? (/\.svg$/i.test(abs) ? "image/svg+xml" : null);
  if (!mime) throw new Error("The file is not a picture (PNG, JPEG, GIF, WebP or SVG).");
  const [saved] = await saveAssets(projectDir, [{ mime, data: buf.toString("base64"), name: name || path.basename(abs) }]);
  return saved;
}

/** Two lists of pictures as one ([{ url, alt }], each address once, the first list first). */
export function mergeImages(a = [], b = []) {
  const out = new Map();
  for (const i of [...a, ...b]) if (i?.url && !out.has(i.url)) out.set(i.url, { url: i.url, alt: i.alt ?? "" });
  return [...out.values()];
}

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
/**
 * Pictures a web page held only in memory (`blobs`: [{ alt, w, h, data: base64 }], read by the app in the page) kept as files in
 * <project>/.studio/sources/assets (named by their content, so the same picture is one file): [{ file, name, alt, w, h }]. What is no picture is left out.
 */
export async function saveBlobPictures(projectDir, blobs = []) {
  const dir = path.join(projectDir, ".studio", "sources", "assets"), out = [];
  for (const b of Array.isArray(blobs) ? blobs.slice(0, 40) : []) {
    let buf; try { buf = Buffer.from(String(b?.data ?? ""), "base64"); } catch { continue; }
    const ext = EXT[sniff(buf)];
    if (!ext || buf.length > MAX_BYTES) continue;
    const name = `web-${createHash("sha1").update(buf).digest("hex").slice(0, 10)}.${ext}`;
    if (out.some((o) => o.name === name)) continue;
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buf);
    out.push({ file: path.join(dir, name), name, alt: String(b.alt ?? "").replace(/\s+/g, " ").trim().slice(0, 120), w: b.w || 0, h: b.h || 0 });
  }
  return out;
}
