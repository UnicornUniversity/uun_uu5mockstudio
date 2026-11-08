import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startMockServer, cleanAddress } from "../src/main/mockServer.mjs";
import { makeProject } from "./helpers.mjs";

const root = await makeProject();
await mkdir(root + "-evil"); await writeFile(path.join(root + "-evil", "x.txt"), "secret");
const { server, port } = await startMockServer(root, { routes: { "/__warmup/0.html": "<p>warm</p>" } });
after(() => server.close());
const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);

test("serves mockups as html without caching", async () => {
  const r = await get("/a.html");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(await r.text(), "<h1>a</h1>");
});

test("missing file is a 404, not a crash", async () => {
  assert.equal((await get("/nope.html")).status, 404);
  assert.equal((await get("/a.html")).status, 200);
});

test("path traversal and sibling directories are blocked", async () => {
  for (const p of ["/../x", "/%2e%2e/x", `/..%2F${path.basename(root)}-evil/x.txt`, "/sub/..%2F..%2Fetc/passwd"])
    assert.equal((await get(p)).status, 404, p);
});

test("hidden state folder is not served", async () => {
  assert.equal((await get("/.studio/state.json")).status, 404);
});

test("in-memory routes are served", async () => {
  assert.equal(await (await get("/__warmup/0.html")).text(), "<p>warm</p>");
});

test("of .studio only the rendered Plus4U documents and their pictures are served", async () => {
  const src = path.join(root, "p", ".studio", "sources");
  await mkdir(path.join(src, "assets"), { recursive: true });
  await writeFile(path.join(src, "mkEcc-1.html"), "<p>doc</p>");
  await writeFile(path.join(src, "assets", "abc.jpg"), "jpg");
  await writeFile(path.join(src, "mkEcc-1.json"), "{}");
  await writeFile(path.join(root, "p", ".studio", "state.json"), "{}");
  assert.equal(await (await get("/p/.studio/sources/mkEcc-1.html")).text(), "<p>doc</p>");
  assert.equal((await get("/p/.studio/sources/assets/abc.jpg")).headers.get("content-type"), "image/jpeg");
  for (const p of ["/p/.studio/sources/mkEcc-1.json", "/p/.studio/state.json", "/p/.studio/sources/../state.json"]) assert.equal((await get(p)).status, 404, p);
});

test("a relative link of a uu5 page (which sets <base> to its own address + /public/0.0.0/) is sent back to the real file", async () => {
  assert.equal(cleanAddress("/Flow test/home.html/public/0.0.0/page.html", "?env=none"), "/Flow%20test/page.html?env=none");
  assert.equal(cleanAddress("/P/home.html/public/0.0.0/assets/logo.png"), "/P/assets/logo.png");
  assert.equal(cleanAddress("/P/home.html/public/0.0.0/page.html/public/0.0.0/x.html"), "/P/x.html"); // a page reached that way sets its own base again
  assert.equal(cleanAddress("/P/home.html"), null); assert.equal(cleanAddress("/P/assets/logo.png"), null);
  const r = await fetch(`http://127.0.0.1:${port}/p/a.html/public/0.0.0/b.html?x=1`, { redirect: "manual" });
  assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/p/b.html?x=1");
});
