import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSitemap, writeSitemap, restoreSitemap, SITEMAP_FILE } from "../src/main/sitemapFile.mjs";
import { normalizeSitemap, sitemapOutline } from "../src/renderer/sitemap.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-"));
const sm = (t) => normalizeSitemap({ root: { title: t, file: "index.html", children: [{ title: "A", type: "section", note: "part" }, { title: "B", file: "b.html" }] } });

test("no file, no sitemap; a written one is read back normalized", async () => {
  const dir = tmp();
  assert.equal(await readSitemap(dir), null);
  await writeSitemap(dir, { root: { title: "P", children: [{ title: "Q", file: "../evil.html" }] } });
  const r = await readSitemap(dir);
  assert.equal(r.sitemap.root.children[0].file, undefined); assert.equal(r.hasPrev, false);
  await assert.rejects(writeSitemap(dir, { nope: 1 }));
});

test("a replacement with backup can be taken back, and again", async () => {
  const dir = tmp();
  await writeSitemap(dir, sm("One"));
  await writeSitemap(dir, sm("Two"), { backup: true });
  assert.equal((await readSitemap(dir)).hasPrev, true);
  assert.equal((await restoreSitemap(dir)).sitemap.root.title, "One");
  assert.equal((await restoreSitemap(dir)).sitemap.root.title, "Two");
  assert.equal(await restoreSitemap(tmp()), null);
});

test("an editing write without backup keeps the earlier backup, a broken file reads as none", async () => {
  const dir = tmp();
  await writeSitemap(dir, sm("One")); await writeSitemap(dir, sm("Two"), { backup: true }); await writeSitemap(dir, sm("Three"));
  assert.equal((await restoreSitemap(dir)).sitemap.root.title, "One");
  fs.writeFileSync(path.join(dir, SITEMAP_FILE), "{broken");
  assert.equal(await readSitemap(dir), null);
});

test("the outline for the agent names pages, types, files and notes", () => {
  const out = sitemapOutline(sm("Portal"));
  assert.equal(out, "- Portal -> index.html\n  - A [section] (part)\n  - B -> b.html");
  assert.match(sitemapOutline(sm("x"), { limit: 10 }), /shortened/);
});
