import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveFrame, readFrame, loadFrame, listFrames, removeFrame, parseFrameEnv, frameEnv, renderFrame, slug } from "../src/main/frames.mjs";
import { wrapPage } from "../src/main/environments.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
const PAGE = `<html><head><title>Welcome</title><meta name="uu5mock:breadcrumb" content="Book > Intro"></head><body><div id="uu5"></div></body></html>`;
const FRAME = { label: "BookKit g02", url: "https://uuapp.plus4u.net/x", html: `<header>{{title}}</header><nav>{{breadcrumb}}</nav>`, css: "header{position:fixed}", offset: { top: 90, left: 382 } };

test("slug and env ids", () => {
  assert.equal(slug("Žluťoučký Kůň 2"), "zlutoucky-kun-2");
  assert.deepEqual(parseFrameEnv("custom:project:bookkit-g02"), { scope: "project", id: "bookkit-g02" });
  assert.equal(parseFrameEnv("custom:project:../x"), null);
  assert.equal(parseFrameEnv("managementkit"), null);
});

test("save, read, list, remove; ids stay unique", () => {
  const dir = tmp();
  const a = saveFrame(dir, "project", FRAME), b = saveFrame(dir, "project", FRAME);
  assert.equal(a.id, "bookkit-g02"); assert.equal(b.id, "bookkit-g02-2");
  assert.deepEqual(readFrame(dir, a.id).offset, { top: 90, right: 0, bottom: 0, left: 382 });
  const base = (scope) => (scope === "project" ? dir : null);
  assert.deepEqual(listFrames(base).map((f) => f.id), [frameEnv("project", "bookkit-g02"), frameEnv("project", "bookkit-g02-2")]);
  removeFrame(dir, a.id);
  assert.equal(listFrames(base).length, 1);
  assert.throws(() => saveFrame(dir, "project", { ...FRAME, html: " " }));
  assert.throws(() => removeFrame(dir, "../x"));
});

test("wrapPage draws a custom frame with the title and breadcrumb, escaped, offsets applied", () => {
  const dir = tmp(); const { env } = saveFrame(dir, "global", FRAME);
  const resolve = (e) => loadFrame(() => dir, e);
  const out = wrapPage(PAGE.replace("Welcome", "A & B"), env, resolve);
  assert.ok(out.indexOf("<header>A &amp; B</header>") < out.indexOf('id="uu5"'));
  assert.ok(out.includes('<span class="uu5mock-crumb">Book</span><span class="uu5mock-crumb">Intro</span>'));
  assert.ok(out.includes("top:90px;left:382px") && out.includes("data-uu5mock-shell"));
});

test("an unknown or missing custom frame leaves the page alone", () => {
  assert.equal(wrapPage(PAGE, "custom:project:nope", () => null), PAGE);
  assert.equal(wrapPage(PAGE, "custom:project:nope"), PAGE);
});

test("renderFrame fills every variable", () => {
  const out = renderFrame({ html: "{{ title }}|{{parents}}", css: "", offset: { top: 0, right: 0, bottom: 0, left: 0 } }, { title: "T", parents: ["A", "B"] });
  assert.ok(out.includes("T|A › B"));
});

test("the capture scripts are valid JavaScript", async () => {
  const { PICKER, EXTRACT } = await import("../src/main/frameCapture.mjs");
  assert.doesNotThrow(() => new Function(PICKER));
  assert.doesNotThrow(() => new Function(`return ${EXTRACT}`));
  // several parts (Shift): the picker keeps a list of them and the extraction takes the rectangle around them all
  assert.match(PICKER, /e\.shiftKey/);
  assert.match(EXTRACT, /querySelectorAll\("\[data-uu5mock-slot\]"\)/);
  assert.match(EXTRACT, /__uu5mockRects/);
});

test("updateFrame changes the given parts and keeps the rest", async () => {
  const { updateFrame } = await import("../src/main/frames.mjs");
  const dir = tmp(); const { id } = saveFrame(dir, "project", FRAME);
  updateFrame(dir, id, { label: "Renamed", offset: { top: 100 }, css: "x{y:z}" });
  const f = readFrame(dir, id);
  assert.equal(f.label, "Renamed"); assert.equal(f.offset.top, 100); assert.equal(f.offset.left, 382); assert.equal(f.css, "x{y:z}"); assert.equal(f.html, FRAME.html); assert.equal(f.url, FRAME.url);
  assert.throws(() => updateFrame(dir, id, { html: " " })); assert.throws(() => updateFrame(dir, id, { label: "" })); assert.throws(() => updateFrame(dir, "nope", {}));
});

test("pictures of a frame of any type are inlined at render time", () => {
  const dir = tmp(); const { id } = saveFrame(dir, "project", { ...FRAME, html: '<div style="background-image:url(frame-img/bg0.jpg)"></div><img src="frame-img/r1.png">' });
  fs.mkdirSync(path.join(dir, id, "img")); fs.writeFileSync(path.join(dir, id, "img", "bg0.jpg"), "J"); fs.writeFileSync(path.join(dir, id, "img", "r1.png"), "P");
  const out = renderFrame(readFrame(dir, id), { title: "T" });
  assert.ok(out.includes("data:image/jpeg;base64,") && out.includes("data:image/png;base64,") && !out.includes("frame-img/"));
});

test("every renderer and main module parses (a syntax error there leaves the whole app dead)", async () => {
  const { execFileSync } = await import("node:child_process");
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "src");
  for (const dir of ["renderer", "main"]) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter((n) => /\.(m?js|cjs)$/.test(n))) {
      assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", path.join(root, dir, f)], { stdio: "pipe" }), `${dir}/${f} does not parse`);
    }
  }
});
