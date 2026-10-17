import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { bundlePath, canSelfUpdate, downloadTo, digestHex, unpackAndCheck, SWAP_SCRIPT } from "../src/main/selfUpdate.mjs";
import { pickZip, parseRelease, DEFAULT_REPO } from "../src/main/githubUpdates.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "selfupdate-test-"));
const serve = (body) => new Promise((resolve) => {
  const s = http.createServer((_q, r) => { r.setHeader("content-length", body.length); r.end(body); }).listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${s.address().port}/a.zip`, close: () => s.close() }));
});

test("bundlePath finds the .app around the executable", () => {
  assert.equal(bundlePath("/Applications/uu5Mock Studio.app/Contents/MacOS/uu5Mock Studio"), "/Applications/uu5Mock Studio.app");
  assert.equal(bundlePath("/usr/local/bin/electron"), null);
});

test("canSelfUpdate: only a packaged macOS app without a feed in a writable folder", async () => {
  const dir = tmp(), exe = path.join(dir, "X.app/Contents/MacOS/X");
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  assert.equal(await canSelfUpdate({ platform: "darwin", packaged: true, execPath: exe }), true);
  assert.equal(await canSelfUpdate({ platform: "darwin", packaged: false, execPath: exe }), false);
  assert.equal(await canSelfUpdate({ platform: "darwin", packaged: true, hasFeed: true, execPath: exe }), false);
  assert.equal(await canSelfUpdate({ platform: "win32", packaged: true, execPath: exe }), false);
  assert.equal(await canSelfUpdate({ platform: "darwin", packaged: true, execPath: "/nowhere/X.app/Contents/MacOS/X" }), false);
  fs.rmSync(dir, { recursive: true });
});

test("pickZip picks the zip of the right architecture; the release carries it with the checksum", () => {
  const a = (name, digest) => ({ name, browser_download_url: `https://github.com/${DEFAULT_REPO}/releases/download/v1/${name}`, size: 5, digest });
  const assets = [a("S-1-arm64.dmg"), a("S-1-arm64.zip", "sha256:" + "a".repeat(64)), a("S-1-x64.zip")];
  assert.equal(pickZip(assets, "arm64").name, "S-1-arm64.zip");
  assert.equal(pickZip(assets, "x64").name, "S-1-x64.zip");
  assert.equal(pickZip([a("S-1-arm64.dmg")], "arm64"), null);
  const rel = parseRelease({ tag_name: "v1.0.0", draft: false, prerelease: false, assets }, { platform: "darwin", arch: "arm64" });
  assert.equal(rel.zip.digest, "sha256:" + "a".repeat(64));
  assert.equal(digestHex(rel.zip.digest), "a".repeat(64));
  assert.equal(digestHex("md5:abc"), null);
});

test("downloadTo reports progress and checks size and checksum", async () => {
  const body = Buffer.from("x".repeat(200_000)), sha = crypto.createHash("sha256").update(body).digest("hex"), dir = tmp(), srv = await serve(body);
  const seen = [];
  const r = await downloadTo(path.join(dir, "ok.zip"), srv.url, { size: body.length, sha256: sha, onProgress: (p) => seen.push(p) });
  assert.equal(r.size, body.length); assert.equal(fs.readFileSync(path.join(dir, "ok.zip")).length, body.length); assert.ok(seen.length > 0 && seen.every((p) => p <= 99));
  await assert.rejects(downloadTo(path.join(dir, "bad.zip"), srv.url, { sha256: "0".repeat(64) }), /checksum/);
  assert.equal(fs.existsSync(path.join(dir, "bad.zip")), false, "a rejected download leaves no file");
  await assert.rejects(downloadTo(path.join(dir, "size.zip"), srv.url, { size: 5 }), /wrong size/);
  srv.close(); fs.rmSync(dir, { recursive: true });
});

test("unpackAndCheck accepts one app of this product in the announced version and refuses anything else", async () => {
  const dir = tmp();
  const exec = (app, id, ver, bad) => async (cmd, args) => {
    if (cmd.endsWith("ditto")) { fs.mkdirSync(path.join(args[3], app, "Contents"), { recursive: true }); return {}; }
    if (cmd.endsWith("plutil")) return { stdout: args[1] === "CFBundleIdentifier" ? id : ver };
    if (bad) throw new Error("bad"); return {};
  };
  const ok = await unpackAndCheck("z.zip", path.join(dir, "s1"), { bundleId: "id", version: "2.0.0", exec: exec("A.app", "id", "2.0.0") });
  assert.match(ok, /A\.app$/);
  await assert.rejects(unpackAndCheck("z.zip", path.join(dir, "s2"), { bundleId: "id", version: "2.0.0", exec: exec("A.app", "other", "2.0.0") }), /different application/);
  await assert.rejects(unpackAndCheck("z.zip", path.join(dir, "s3"), { bundleId: "id", version: "2.0.0", exec: exec("A.app", "id", "1.0.0") }), /different version/);
  await assert.rejects(unpackAndCheck("z.zip", path.join(dir, "s4"), { bundleId: "id", version: "2.0.0", exec: exec("A.app", "id", "2.0.0", true) }), /signature/);
  fs.rmSync(dir, { recursive: true });
});

test("the swap script replaces the bundle, keeps the old one on failure, and starts the app", () => {
  const dir = tmp(), script = path.join(dir, "swap.sh"), log = path.join(dir, "log");
  fs.writeFileSync(script, SWAP_SCRIPT, { mode: 0o700 });
  const make = (name, text) => { fs.mkdirSync(path.join(dir, name), { recursive: true }); fs.writeFileSync(path.join(dir, name, "v"), text); };
  const relaunch = path.join(dir, "relaunch.sh"); fs.writeFileSync(relaunch, `#!/bin/sh\necho "$1" >> "${log}"\n`, { mode: 0o700 });
  const swap = (target, staged, stage) => spawnSync("/bin/sh", [script, "99999999", target, staged, stage, stage + ".old"], { env: { ...process.env, RELAUNCH: relaunch } });
  make("old.app", "1"); make("stage/new.app", "2");
  swap(path.join(dir, "old.app"), path.join(dir, "stage/new.app"), path.join(dir, "stage"));
  assert.equal(fs.readFileSync(path.join(dir, "old.app/v"), "utf8"), "2"); assert.equal(fs.existsSync(path.join(dir, "stage")), false); assert.equal(fs.existsSync(path.join(dir, "stage.old")), false);
  assert.match(fs.readFileSync(log, "utf8"), /old\.app/);
  make("keep.app", "1"); // the staged app is missing: the old one stays
  swap(path.join(dir, "keep.app"), path.join(dir, "stage2/none.app"), path.join(dir, "stage2"));
  assert.equal(fs.readFileSync(path.join(dir, "keep.app/v"), "utf8"), "1");
  fs.rmSync(dir, { recursive: true });
});
