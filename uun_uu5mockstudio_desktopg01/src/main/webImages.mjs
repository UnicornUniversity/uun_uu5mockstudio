import dns from "node:dns/promises";
import net from "node:net";
import { saveAssets, sniff, MAX_BYTES } from "./attachments.mjs";

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
export async function downloadWebImage(projectDir, url, name, opts = {}) {
  const r = await get(url, { ...opts, max: MAX_BYTES });
  const mime = sniff(r.buf) ?? (/image\/svg\+xml/i.test(r.type) || /\.svg(?:[?#]|$)/i.test(r.url) ? "image/svg+xml" : null);
  if (!mime) throw new Error("The address is not a picture (PNG, JPEG, GIF, WebP or SVG).");
  const [file] = await saveAssets(projectDir, [{ mime, data: r.buf.toString("base64"), name: name || new URL(r.url).pathname }]);
  return file;
}
