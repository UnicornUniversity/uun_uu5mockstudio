import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { saveAttachments, sniff, MAX_FILES } from "../src/main/attachments.mjs";
import { tmp } from "./helpers.mjs";

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const b64 = (b) => b.toString("base64");

test("sniff recognises image signatures", () => {
  assert.equal(sniff(PNG), "image/png"); assert.equal(sniff(JPG), "image/jpeg");
  assert.equal(sniff(Buffer.from("GIF89a....")), "image/gif");
  assert.equal(sniff(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])), "image/webp");
  assert.equal(sniff(Buffer.from("<svg onload=alert(1)>")), null);
});

test("images are stored under the hidden .studio/attachments with generated names", async () => {
  const dir = await tmp("att");
  const [a, b] = await saveAttachments(dir, [{ mime: "image/png", data: b64(PNG) }, { mime: "image/jpeg", data: b64(JPG) }]);
  assert.ok(a.startsWith(path.join(dir, ".studio", "attachments") + path.sep) && a.endsWith(".png") && b.endsWith(".jpg"));
  assert.ok((await readFile(a)).equals(PNG));
  assert.equal((await readdir(path.join(dir, ".studio", "attachments"))).length, 2);
});

test("nothing to save is fine, bad input is rejected", async () => {
  const dir = await tmp("att");
  assert.deepEqual(await saveAttachments(dir, []), []);
  await assert.rejects(saveAttachments(dir, [{ mime: "image/svg+xml", data: b64(Buffer.from("<svg/>")) }]), /Unsupported/);
  await assert.rejects(saveAttachments(dir, [{ mime: "image/png", data: b64(Buffer.from("not a png")) }]), /does not match/);
  await assert.rejects(saveAttachments(dir, [{ mime: "image/png", data: "" }]), /empty/);
  await assert.rejects(saveAttachments(dir, Array.from({ length: MAX_FILES + 1 }, () => ({ mime: "image/png", data: b64(PNG) }))), /at most/);
});

test("a bad item does not leave the good ones behind", async () => {
  const dir = await tmp("att");
  await assert.rejects(saveAttachments(dir, [{ mime: "image/png", data: b64(PNG) }, { mime: "image/png", data: b64(Buffer.from("junk")) }]), /does not match/);
  await assert.rejects(readdir(path.join(dir, ".studio", "attachments")), /ENOENT/, "nothing was written, not even the folder");
});

test("a path in the input cannot choose where the file goes", async () => {
  const dir = await tmp("att");
  const [f] = await saveAttachments(dir, [{ mime: "image/png", data: b64(PNG), name: "../../evil.png", path: "/etc/x" }]);
  assert.equal(path.dirname(f), path.join(dir, ".studio", "attachments"));
});

test("pictures for the design go to the served assets/ folder under a clean name and never overwrite", async () => {
  const { saveAssets, assetStem } = await import("../src/main/attachments.mjs");
  assert.equal(assetStem("Můj Logo (2).PNG"), "muj-logo-2"); assert.equal(assetStem("../../x"), "x"); assert.equal(assetStem(""), "image");
  const dir = await tmp("att");
  const [a] = await saveAssets(dir, [{ mime: "image/png", data: b64(PNG), name: "Logo.png" }]);
  const [b] = await saveAssets(dir, [{ mime: "image/png", data: b64(PNG), name: "logo.png" }]);
  assert.equal(a, "assets/logo.png"); assert.equal(b, "assets/logo-2.png");
  assert.ok((await readFile(path.join(dir, a))).equals(PNG));
  await assert.rejects(saveAssets(dir, [{ mime: "image/png", data: b64(Buffer.from("junk")), name: "x.png" }]), /does not match/);
});

test("an SVG is accepted only as an asset and only when it is a plain drawing", async () => {
  const { saveAssets } = await import("../src/main/attachments.mjs");
  const dir = await tmp("att");
  const ok = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');
  const [a] = await saveAssets(dir, [{ mime: "image/svg+xml", data: b64(ok), name: "Logo.svg" }]);
  assert.equal(a, "assets/logo.svg"); assert.ok((await readFile(path.join(dir, a))).equals(ok));
  for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg onload="x()"></svg>', '<svg><a href="javascript:x()"/></svg>', '<svg><image href="https://evil/x.png"/></svg>', '<svg><foreignObject/></svg>', "<html></html>"])
    await assert.rejects(saveAssets(dir, [{ mime: "image/svg+xml", data: b64(Buffer.from(bad)), name: "x.svg" }]), /SVG/);
  await assert.rejects(saveAttachments(dir, [{ mime: "image/svg+xml", data: b64(ok) }]), /Unsupported/);
});
