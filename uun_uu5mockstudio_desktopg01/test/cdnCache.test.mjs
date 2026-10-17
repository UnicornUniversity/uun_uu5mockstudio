import { test } from "node:test";
import assert from "node:assert/strict";
import { createCdnCache } from "../src/main/cdnCache.mjs";
import { tmp } from "./helpers.mjs";

const JS = "https://cdng02.plus4u.net/x/uu-uu5g05/1.52.2/uu5g05.min.js";
const FLOAT = "https://cdng02.plus4u.net/x/uu-uu5g05/1.x/assets/example-config.js";
const REG = "https://uuapp-dev.plus4u.net/registry/dependency/load";

async function setup({ offline = false } = {}) {
  const calls = [];
  let fail = false, off = offline;
  const cache = createCdnCache({
    dir: await tmp("cdn"),
    offline: () => off,
    fetchUpstream: async (req) => {
      calls.push(`${req.method} ${req.url}`);
      if (fail) throw new Error("network down");
      const body = req.method === "POST" ? await req.text() : "";
      return new Response(`body:${req.url}:${body}`, { status: 200, headers: { "content-type": "application/javascript", "access-control-allow-origin": "*", "x-secret": "drop" } });
    },
  });
  return { cache, calls, down: (v) => (fail = v), offline: (v) => (off = v) };
}
const req = (url, init) => new Request(url, init);

test("versioned GET is cache-first: upstream is hit once", async () => {
  const { cache, calls } = await setup();
  assert.equal(await (await cache.handle(req(JS))).text(), `body:${JS}:`);
  const second = await cache.handle(req(JS));
  assert.equal(await second.text(), `body:${JS}:`);
  assert.equal(calls.length, 1);
  assert.equal(second.headers.get("content-type"), "application/javascript");
  assert.equal(second.headers.get("x-secret"), null, "only whitelisted headers are replayed");
});

test("floating version ranges go to the network first but fall back to the cache", async () => {
  const { cache, calls, down } = await setup();
  await cache.handle(req(FLOAT)); await cache.handle(req(FLOAT));
  assert.equal(calls.length, 2);
  down(true);
  assert.equal(await (await cache.handle(req(FLOAT))).text(), `body:${FLOAT}:`);
});

test("POST responses are keyed by body", async () => {
  const { cache, calls, down } = await setup();
  const post = (b) => cache.handle(req(REG, { method: "POST", body: b }));
  assert.match(await (await post('{"a":1}')).text(), /\{"a":1\}/);
  assert.match(await (await post('{"b":2}')).text(), /\{"b":2\}/);
  down(true);
  assert.match(await (await post('{"a":1}')).text(), /\{"a":1\}/, "replayed for the same body");
  assert.equal((await post('{"c":3}')).status, 504, "unknown body is not answered from another entry");
  assert.equal(calls.length, 4, "2 successful calls + 2 attempts while the network was down (POSTs are network-first)");
});

test("offline mode answers from the cache only", async () => {
  const { cache, calls, offline } = await setup();
  await cache.handle(req(JS));
  offline(true);
  assert.equal(await (await cache.handle(req(JS))).text(), `body:${JS}:`);
  const miss = await cache.handle(req("https://cdn.plus4u.net/libs/other.js"));
  assert.equal(miss.status, 504);
  assert.match(await miss.text(), /Offline/);
  assert.equal(calls.length, 1, "no network call while offline");
});

test("offline CORS preflight is answered locally", async () => {
  const { cache, calls } = await setup({ offline: true });
  const r = await cache.handle(req(REG, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:1", "access-control-request-headers": "content-type" } }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "http://127.0.0.1:1");
  assert.equal(calls.length, 0);
});

test("hosts outside plus4u.net pass through untouched and are never stored", async () => {
  const { cache, calls } = await setup();
  const url = "https://example.com/lib.js";
  await cache.handle(req(url)); await cache.handle(req(url));
  assert.equal(calls.length, 2);
  assert.equal((await cache.stats()).files, 0);
});

test("only successful responses are stored", async () => {
  const dir = await tmp("cdn");
  let n = 0;
  const cache = createCdnCache({ dir, fetchUpstream: async () => (++n === 1 ? new Response("err", { status: 500 }) : new Response("ok", { status: 200 })) });
  assert.equal((await cache.handle(req(JS))).status, 500);
  assert.equal((await cache.stats()).files, 0);
  assert.equal(await (await cache.handle(req(JS))).text(), "ok");
  assert.equal((await cache.stats()).files, 1);
});

test("stats and clear", async () => {
  const { cache } = await setup();
  await cache.handle(req(JS)); await cache.handle(req(FLOAT));
  const s = await cache.stats();
  assert.equal(s.files, 2); assert.ok(s.bytes > 0);
  await cache.clear();
  assert.deepEqual(await cache.stats(), { files: 0, bytes: 0 });
});
