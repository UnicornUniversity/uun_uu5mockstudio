import test from "node:test";
import assert from "node:assert/strict";
import { GUIDE_TYPES, GUIDE_TYPE_IDS, buildGuidePrompt, guideTemplate } from "../src/renderer/guide.js";
import { loadSource } from "../src/main/templates.mjs";
import path from "node:path";

test("every type of the guide points at a built-in template of its level", async () => {
  const { templates } = await loadSource(path.resolve("src/main/templates/builtin"), "builtin");
  for (const id of GUIDE_TYPE_IDS) {
    const { template, level } = guideTemplate(id);
    const t = templates.find((x) => x.id === template);
    assert.ok(t, `${id}: template ${template} exists`);
    assert.equal(t.level, level, `${id}: level`);
    assert.ok(GUIDE_TYPES[id].sections.length >= 5);
  }
});

test("the request holds what was answered and nothing that was left empty", () => {
  const p = buildGuidePrompt({ type: "landing", audience: "parents of new students", action: "apply", sections: ["Benefits", "Questions and answers"], tone: "formal", lang: "cs" });
  assert.match(p, /^Create a landing page for one offer\./);
  assert.match(p, /It is for: parents of new students\./);
  assert.match(p, /What a visitor should do on it: apply\./);
  assert.match(p, /parts: Benefits, Questions and answers\./);
  assert.match(p, /formal and precise tone, in Czech/);
  assert.match(p, /no content yet/i);
  const bare = buildGuidePrompt({ type: "page" });
  assert.doesNotMatch(bare, /It is for|What a visitor|parts:/);
});

test("content given by the user goes in unchanged, after the question part", () => {
  const p = buildGuidePrompt({ type: "portal", content: "  Zprávy\n- Nový web\nhttps://example.com/kontakt  " });
  assert.match(p, /^Create a portal of my team or unit\./);
  assert.match(p, /do not invent facts/);
  assert.ok(p.endsWith("Zprávy\n- Nový web\nhttps://example.com/kontakt"));
  assert.doesNotMatch(p, /no content yet/i);
});

test("an unknown type falls back to a web page", () => {
  assert.match(buildGuidePrompt({ type: "x" }), /a page of a web site/);
});
