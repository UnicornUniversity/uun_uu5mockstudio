import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

/** Static server for the project folder. `routes` maps an exact URL path to in-memory HTML (used for the CDN warm-up pages). */
/** `transformHtml(text)` rewrites project .html files on their way to the preview (the files on disk stay as they are). */
export function startMockServer(root, { routes = {}, transformHtml } = {}) {
  root = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (routes[rel] !== undefined) {
        res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
        return res.end(routes[rel]);
      }
      const file = path.join(root, rel);
      if (file !== root && !file.startsWith(root + path.sep)) throw new Error("outside root");
      if (rel.split("/").some((seg) => seg.startsWith(".") && seg.length > 1)) throw new Error("hidden"); // keeps .studio/ state private
      const data = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(transformHtml && path.extname(file) === ".html" ? transformHtml(data.toString("utf8")) : data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}
