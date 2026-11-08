import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isPrivateAddress, checkPublicUrl, imagesOfHtml, downloadWebImage, listWebImages } from "../src/main/webImages.mjs";
import { makeProject } from "./helpers.mjs";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const check = (u) => checkPublicUrl(u, { lookup: async () => [{ address: "93.184.216.34" }] });
const reply = (body, type = "image/png", status = 200, headers = {}) => async () => new Response(body, { status, headers: { "content-type": type, ...headers } });

test("private and local addresses are refused", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "169.254.169.254", "172.20.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) assert.ok(isPrivateAddress(ip), ip);
  assert.ok(!isPrivateAddress("93.184.216.34"));
  await assert.rejects(checkPublicUrl("http://localhost:8080/a.png"), /public internet|cannot be found/);
  await assert.rejects(checkPublicUrl("http://127.0.0.1/a.png"), /public internet/);
  await assert.rejects(checkPublicUrl("file:///etc/passwd"), /http/);
});

test("imagesOfHtml finds img, srcset, lazy sources, og:image and CSS backgrounds", () => {
  const html = `<meta property="og:image" content="/og.jpg"><img src="/a.jpg" alt="Martin Macík"><img data-src="b.png" src="data:image/gif;base64,xx">
    <img srcset="s.jpg 1x, l.jpg 2x" alt="Ivana"><div style="background:url('/bg.webp')"></div><img src="https://x.net/c.jpg?w=1&amp;h=2">`;
  const r = imagesOfHtml(html, "https://u.net/en/");
  const urls = r.map((i) => i.url);
  assert.deepEqual(urls.sort(), ["https://u.net/b.png".replace("/b.png", "/en/b.png"), "https://u.net/a.jpg", "https://u.net/bg.webp", "https://u.net/en/l.jpg", "https://u.net/og.jpg", "https://x.net/c.jpg?w=1&h=2"].sort());
  assert.equal(r.find((i) => i.url.endsWith("/a.jpg")).alt, "Martin Macík");
});

test("downloadWebImage saves a real picture to assets and refuses other content", async () => {
  const root = await makeProject({});
  const rel = await downloadWebImage(root, "https://u.net/x/martin.png", "Martin Macík", { fetchImpl: reply(PNG), check });
  assert.equal(rel, "assets/martin-macik.png");
  assert.equal((await readFile(path.join(root, rel))).length, PNG.length);
  assert.equal(await downloadWebImage(root, "https://u.net/x/martin.png", "Martin Macík", { fetchImpl: reply(PNG), check }), "assets/martin-macik-2.png");
  await assert.rejects(downloadWebImage(root, "https://u.net/x", "x", { fetchImpl: reply("<html>", "text/html"), check }), /not a picture/);
  await assert.rejects(downloadWebImage(root, "https://u.net/x", "x", { fetchImpl: reply(PNG, "image/png", 404), check }), /404/);
});

test("a redirect to a private address is stopped and a page is listed", async () => {
  const root = await makeProject({});
  const strict = (u) => checkPublicUrl(u, { lookup: async (h) => [{ address: h === "evil.test" ? "127.0.0.1" : "93.184.216.34" }] });
  const redirect = reply("", "text/plain", 302, { location: "http://evil.test/a.png" });
  await assert.rejects(downloadWebImage(root, "https://u.net/a.png", "a", { fetchImpl: redirect, check: strict }), /public internet/);
  const list = await listWebImages("https://u.net/", { fetchImpl: reply('<img src="/p.jpg" alt="P">', "text/html"), check });
  assert.deepEqual(list, [{ url: "https://u.net/p.jpg", alt: "P" }]);
});
