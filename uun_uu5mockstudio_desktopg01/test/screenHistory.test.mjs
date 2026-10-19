import { test } from "node:test";
import assert from "node:assert/strict";
import { createScreenHistory } from "../src/main/screenHistory.mjs";

test("undo and redo step by step, and a new change drops the redo steps", () => {
  const h = createScreenHistory();
  h.record("a.html", "v0", "v1", "one"); h.record("a.html", "v1", "v2", "two");
  assert.deepEqual(h.state("a.html"), { undo: 2, redo: 0, undoLabel: "two", redoLabel: null });
  assert.deepEqual(h.undo("a.html", "v2"), { html: "v1", label: "two" });
  assert.deepEqual(h.undo("a.html", "v1"), { html: "v0", label: "one" });
  assert.match(h.undo("a.html", "v0").error, /Nothing to undo/);
  assert.deepEqual(h.redo("a.html", "v0"), { html: "v1", label: "one" });
  h.record("a.html", "v1", "v3", "three");
  assert.match(h.redo("a.html", "v3").error, /Nothing to redo/);
  assert.equal(h.state("a.html").undo, 2);
});

test("steps are not undone over a file somebody else changed", () => {
  const h = createScreenHistory();
  h.record("a.html", "v0", "v1", "one");
  const r = h.undo("a.html", "changed by the agent");
  assert.match(r.error, /changed outside/); assert.equal(h.state("a.html").undo, 0);
  h.record("b.html", "x", "y"); h.record("b.html", "y", "y"); assert.equal(h.state("b.html").undo, 1, "no change, no step");
  assert.equal(h.state("a.html").undo, 0, "files have their own steps");
});

test("the history is limited", () => {
  const h = createScreenHistory(3);
  for (let i = 0; i < 6; i++) h.record("a", `v${i}`, `v${i + 1}`);
  assert.equal(h.state("a").undo, 3);
});

test("latest: the file with the most recent step that can be undone or redone", () => {
  const h = createScreenHistory();
  h.record("/p/a.html", "a0", "a1"); h.record("/p/b.html", "b0", "b1"); h.record("/q/c.html", "c0", "c1");
  assert.equal(h.latest("undo"), "/q/c.html");
  assert.equal(h.latest("undo", (k) => k.startsWith("/p/")), "/p/b.html", "only the files of one project");
  h.undo("/p/b.html", "b1");
  assert.equal(h.latest("undo", (k) => k.startsWith("/p/")), "/p/a.html");
  assert.equal(h.latest("redo", (k) => k.startsWith("/p/")), "/p/b.html");
  assert.equal(h.latest("redo", (k) => k.startsWith("/zzz/")), null);
});
