import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPreviewCheck } from "../src/main/previewCheck.mjs";

const docs = { available: () => true, get: () => null, list: () => ["Uu5Elements.Button", "Uu5Elements.Text", "Uu5Elements.Unknown"].map((name) => ({ name })) };
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pc-")), "check.json");

test("every previewable component is probed once and the result is remembered", async () => {
  const f = file(), seen = [];
  const probe = async (n) => { seen.push(n); return n.endsWith("Text") ? "fail" : "ok"; };
  const c = createPreviewCheck({ docs, file: f, probe });
  assert.equal(c.status("Uu5Elements.Button"), undefined);
  await c.run();
  assert.deepEqual(seen.sort(), ["Uu5Elements.Button", "Uu5Elements.Text"]); // Unknown has no snippet: not probed
  assert.equal(c.status("Uu5Elements.Button"), "ok");
  assert.equal(c.status("Uu5Elements.Text"), "fail");
  const again = createPreviewCheck({ docs, file: f, probe: async () => assert.fail("already checked") });
  await again.run();
  assert.equal(again.status("Uu5Elements.Text"), "fail");
});

test("a probe that throws counts as a failure", async () => {
  const c = createPreviewCheck({ docs, file: file(), probe: async () => { throw new Error("x"); } });
  await c.run();
  assert.equal(c.status("Uu5Elements.Button"), "fail");
});
