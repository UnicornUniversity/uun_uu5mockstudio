import test from "node:test";
import assert from "node:assert/strict";
import { wrapPage, pageHead, ENVIRONMENTS, isEnvironment, LOGO_URL } from "../src/main/environments.mjs";
import { parseTemplate } from "../src/main/templates.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PAGE = `<!doctype html><html><head><title>Unicorn University Portal</title><meta name="uu5mock:breadcrumb" content="Information Sharing > Docs">
<script>var uu5DemoDependencies = { uu5bricksg01: "1.x" };</script><script src="https://x/uu-uu5g05/1.x/assets/example-config.js" crossorigin></script></head><body><div id="uu5"></div></body></html>`;

test("none and unknown ids leave the page alone", () => {
  assert.equal(wrapPage(PAGE, "none"), PAGE);
  assert.equal(wrapPage(PAGE, undefined), PAGE);
  assert.equal(wrapPage(PAGE, "nope"), PAGE);
});

test("pageHead reads the title and the parents of the breadcrumb", () => {
  assert.deepEqual(pageHead(PAGE), { title: "Unicorn University Portal", parents: ["Information Sharing", "Docs"] });
  assert.deepEqual(pageHead("<html></html>"), { title: "Page", parents: [] });
});

test("managementkit draws the fixed shell right after <body>, before the content", () => {
  const out = wrapPage(PAGE, "managementkit");
  assert.ok(out.indexOf("mk-top") < out.indexOf('id="uu5"'));
  assert.ok(out.includes(LOGO_URL) && out.includes("Unicorn University Portal") && out.includes("Information Sharing") && out.includes("Prozkoumat"));
  assert.ok(!out.includes("Plus4U5App.Top"));
});

test("the title is escaped", () => {
  const out = wrapPage(PAGE.replace("Unicorn University Portal", "A & \"q\""), "managementkit");
  assert.ok(out.includes("A &amp; &quot;q&quot;"));
});

test("the environments are listed", () => {
  assert.deepEqual(ENVIRONMENTS.map((e) => e.id), ["none", "managementkit"]);
  assert.ok(isEnvironment("managementkit") && !isEnvironment("x"));
});

test("the built-in Portal template starts in uuManagementKit", async () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/main/templates/builtin/page-portal");
  const { template } = await parseTemplate(dir, "builtin");
  assert.equal(template.environment, "managementkit");
});

test("the shell puts the content on a white background", () => {
  assert.ok(wrapPage(PAGE, "managementkit").includes("html,body{background:#fff!important}"));
});
