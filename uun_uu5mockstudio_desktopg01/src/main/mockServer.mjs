import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

/** The rendered Plus4U documents of a project and their pictures: the one part of .studio/ that is served (to picture them). */
export const SOURCE_PAGE = /^\/[^/]+\/\.studio\/sources\/(?:assets\/)?[\w-]+\.(?:html|jpg|png|gif|webp|svg)$/;

/** Static server for the project folder. `routes` maps an exact URL path to in-memory HTML (used for the CDN warm-up pages). */
/** `dynamic(path)` answers a path with HTML made on the fly (a string) or declines it (null / undefined). `transformHtml(text, searchParams)` rewrites project .html files on their way to the preview (the files on disk stay as they are). */
/**
 * A uu5 page sets `<base href="<its own address>/public/0.0.0/">` (the uu5 config does), so a relative link in it (`page.html`,
 * `assets/logo.png`) is asked for as `/<project>/home.html/public/0.0.0/page.html`. That address is sent back to where the file really is.
 */
export const BASE_ECHO = /^\/([^/]+)\/(?:[^/]+\.html\/public\/0\.0\.0\/)+(.+)$/;
export const cleanAddress = (rel, search = "") => { const m = BASE_ECHO.exec(rel); return m ? `/${encodeURIComponent(m[1])}/${m[2].split("/").map(encodeURIComponent).join("/")}${search}` : null; };

export function startMockServer(root, { routes = {}, transformHtml, dynamic } = {}) {
  root = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const rel = decodeURIComponent(url.pathname);
      if (routes[rel] !== undefined) {
        res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
        return res.end(routes[rel]);
      }
      const made = dynamic?.(rel);
      if (made) {
        res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
        return res.end(made);
      }
      const clean = cleanAddress(rel, url.search);
      if (clean) { res.writeHead(302, { location: clean, "cache-control": "no-store" }); return res.end(); }
      const file = path.join(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error("outside root");
      if (rel.split("/").some((seg) => seg.startsWith(".") && seg.length > 1) && !SOURCE_PAGE.test(rel)) throw new Error("hidden"); // keeps .studio/ state private (only the rendered Plus4U documents are served)
      const data = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(transformHtml && path.extname(file) === ".html" ? transformHtml(data.toString("utf8"), url.searchParams, rel) : data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}
