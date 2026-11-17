import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bundleScreen, bundleFromHtml, pasteScreen, screenRules, addScreenRules, freeName, screenLinks, looksLikeScreen } from "../src/main/screenClip.mjs";
import { makeProject } from "./helpers.mjs";

const SCREEN = `<html><head><title>Orders</title></head><body><script type="text/babel">
const App = () => <div><img src="images/logo.png"/><a href="orders.html">self</a><a href="detail.html">detail</a></div>;
</script></body></html>`;
const read = (d, f) => fs.readFileSync(path.join(d, f), "utf8");

const source = async () => {
  const dir = await makeProject({ "orders.html": SCREEN, "detail.html": "<h1>d</h1>" });
  fs.mkdirSync(path.join(dir, "images")); fs.writeFileSync(path.join(dir, "images", "logo.png"), "LOGO-A");
  fs.writeFileSync(path.join(dir, "orders.notes.md"), "# Notes: orders\n\n<!-- note n1 -->\nCheck totals\n");
  fs.writeFileSync(path.join(dir, "BUSINESS_RULES.md"), "# Business rules\n\n## General\n\n- R-001 general rule\n- R-004 (screen: orders) stray rule\n\n## Screen: orders\n\n- R-002 (screen: orders) total is a sum\n- R-003 (screen: orders) paid orders are locked\n\n## Screen: detail\n\n- R-005 (screen: detail) other\n");
  fs.writeFileSync(path.join(dir, "PROJECT.md"), "# Project description\n\nShop.\n\n## Screen: orders\n\nList of orders.\n");
  return dir;
};

test("the rules of a screen: its section and its items elsewhere", () => {
  const md = "## General\n\n- R-001 x\n- R-004 (screen: orders) stray\n\n## Screen: orders\n\n- R-002 (screen: orders) a\n\n## Screen: b\n\n- R-003 (screen: b) c\n";
  assert.equal(screenRules(md, "orders.html"), "- R-004 (screen: orders) stray\n\n- R-002 (screen: orders) a");
});

test("pasted rules get the next free ids and name the new screen", () => {
  const r = addScreenRules("# Business rules\n\n## General\n\n- R-007 x\n", "orders-2", "- R-001 (screen: orders) a\nsome text\n- R-002 b");
  assert.equal(r.count, 2);
  assert.match(r.md, /## Screen: orders-2\n\n- R-008 \(screen: orders-2\) a\nsome text\n- R-009 \(screen: orders-2\) b\n$/);
});

test("free names, links and plain HTML", () => {
  assert.equal(freeName("orders.html", ["a.html"]), "orders.html");
  assert.equal(freeName("orders.html", ["Orders.html", "orders-2.html"]), "orders-3.html");
  assert.deepEqual(screenLinks(`<a href="detail.html">x</a> navigate('list.html#x')`), ["detail.html", "list.html"]);
  assert.ok(looksLikeScreen(SCREEN)); assert.ok(!looksLikeScreen("hello"));
  assert.equal(bundleFromHtml(SCREEN).file, "orders.html");
});

test("a screen goes to another project with its media, notes, rules and description", async () => {
  const from = await source(), to = await makeProject({ "home.html": "<h1>h</h1>" });
  const b = await bundleScreen(from, "orders.html");
  assert.equal(b.media.length, 1);
  const r = await pasteScreen(to, JSON.parse(JSON.stringify(b)));
  assert.equal(r.file, "orders.html"); assert.equal(r.renamedFrom, null);
  assert.equal(read(to, "orders.html"), SCREEN);
  assert.equal(read(to, "images/logo.png"), "LOGO-A");
  assert.match(read(to, "orders.notes.md"), /Check totals/);
  assert.equal(r.rules, 3); assert.equal(r.notes, 1); assert.equal(r.media, 1); assert.ok(r.description);
  assert.match(read(to, "BUSINESS_RULES.md"), /## Screen: orders\n\n- R-001 \(screen: orders\) stray rule\n\n- R-002 \(screen: orders\) total is a sum/);
  assert.match(read(to, "PROJECT.md"), /## Screen: orders\n\nList of orders\./);
  assert.deepEqual(r.missingLinks, ["detail.html"]);
});

test("a name that is taken and a picture that differs get new names; the same picture is reused", async () => {
  const from = await source(), b = await bundleScreen(from, "orders.html");
  const to = await makeProject({ "orders.html": "<h1>other</h1>" });
  fs.mkdirSync(path.join(to, "images")); fs.writeFileSync(path.join(to, "images", "logo.png"), "LOGO-B");
  const r = await pasteScreen(to, b);
  assert.equal(r.file, "orders-2.html"); assert.equal(r.renamedFrom, "orders.html");
  const html = read(to, "orders-2.html");
  assert.match(html, /src="images\/logo-2.png"/); assert.match(html, /href="orders-2.html"/);
  assert.equal(read(to, "images/logo-2.png"), "LOGO-A"); assert.equal(read(to, "images/logo.png"), "LOGO-B");
  assert.match(read(to, "orders-2.notes.md"), /^# Notes: orders-2/);
  assert.equal(read(to, "orders.html"), "<h1>other</h1>");
  // pasted again: logo-2.png has the same bytes, nothing new is written
  const r2 = await pasteScreen(to, b);
  assert.equal(r2.file, "orders-3.html"); assert.equal(r2.media, 0);
  assert.match(read(to, "orders-3.html"), /images\/logo-2.png/);
});

test("pasting into the same project makes a copy", async () => {
  const dir = await source(), r = await pasteScreen(dir, await bundleScreen(dir, "orders.html"));
  assert.equal(r.file, "orders-2.html"); assert.equal(r.media, 0); assert.deepEqual(r.missingLinks, []);
  assert.match(read(dir, "BUSINESS_RULES.md"), /## Screen: orders-2\n\n- R-006 \(screen: orders-2\) stray rule/);
});

test("anything else is refused", async () => {
  const to = await makeProject({});
  await assert.rejects(pasteScreen(to, { kind: "x" }), /no screen/);
});
