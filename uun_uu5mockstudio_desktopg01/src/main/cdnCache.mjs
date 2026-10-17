import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import path from "node:path";

const KEEP_HEADERS = ["content-type", "access-control-allow-origin", "access-control-allow-credentials", "cache-control", "etag", "last-modified"];
const FLOATING = /\/\d+\.x\/|uu5loaderg01\.min\.js$/; // version ranges resolve to different files over time

/** Floating resources and every non-GET (e.g. the library registry) prefer the network; immutable versioned files prefer the cache. */
const networkFirst = (method, url) => method !== "GET" || FLOATING.test(url.pathname);

const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

/**
 * Record/replay cache for the uu5 CDN so mockups keep rendering offline.
 * `fetchUpstream(request)` performs the real network call; `offline()` forces cache-only.
 */
export function createCdnCache({ dir, fetchUpstream, offline = () => false, allowHost = (h) => h.endsWith(".plus4u.net") }) {
  const file = (key, ext) => path.join(dir, key + ext);

  const read = async (key) => {
    try { return { meta: JSON.parse(await readFile(file(key, ".json"), "utf8")), body: await readFile(file(key, ".body")) }; } catch { return null; }
  };
  const write = async (key, meta, body) => {
    await mkdir(dir, { recursive: true });
    await writeFile(file(key, ".body"), body);
    await writeFile(file(key, ".json"), JSON.stringify(meta));
  };
  const replay = ({ meta, body }) => new Response(body, { status: 200, headers: meta.headers });
  const corsPreflight = (request) => new Response(null, { status: 204, headers: {
    "access-control-allow-origin": request.headers.get("origin") ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? "*",
  } });

  async function handle(request) {
    const url = new URL(request.url);
    if (!allowHost(url.hostname)) return fetchUpstream(request);
    if (request.method === "OPTIONS") return offline() ? corsPreflight(request) : fetchUpstream(request);
    const body = request.method === "GET" || request.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await request.clone().arrayBuffer());
    const key = createHash("sha1").update(request.method + " " + url.href + "\n").update(body).digest("hex");
    const cached = await read(key);

    if (offline()) return cached ? replay(cached) : new Response(`Offline: ${url.href} is not in the local CDN cache. Run "Warm up CDN cache" while online.`, { status: 504 });
    const nf = networkFirst(request.method, url);
    if (cached && !nf) return replay(cached);
    try {
      const res = await withTimeout(fetchUpstream(request), cached ? 4000 : 30000);
      if (res.status === 200 && request.method !== "HEAD") {
        const buf = Buffer.from(await res.clone().arrayBuffer());
        const headers = Object.fromEntries(KEEP_HEADERS.map((h) => [h, res.headers.get(h)]).filter((e) => e[1]));
        await write(key, { url: url.href, method: request.method, headers, savedAt: Date.now() }, buf).catch(() => {});
      }
      return res;
    } catch (e) {
      return cached ? replay(cached) : new Response(`Upstream unreachable: ${url.href} (${e.message})`, { status: 504 });
    }
  }

  async function stats() {
    let files = 0, bytes = 0;
    try {
      for (const f of await readdir(dir)) if (f.endsWith(".body")) { files++; bytes += (await stat(path.join(dir, f))).size; }
    } catch {}
    return { files, bytes };
  }
  const clear = () => rm(dir, { recursive: true, force: true });

  return { handle, stats, clear };
}
