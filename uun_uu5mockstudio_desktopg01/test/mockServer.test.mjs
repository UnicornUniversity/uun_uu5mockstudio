import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startMockServer } from "../src/main/mockServer.mjs";
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
