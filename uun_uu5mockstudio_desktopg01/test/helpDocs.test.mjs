import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { headingSlug, plainText, parseChapters, searchDocs, queryWords, snippet } from "../src/renderer/helpDocs.js";
import { markdownDoc } from "../src/renderer/markdown.js";

const DIR = path.join(import.meta.dirname, "..", "docs", "user");
const real = () => fs.readdirSync(DIR).filter((n) => n.endsWith(".md")).map((file) => ({ file, text: fs.readFileSync(path.join(DIR, file), "utf8") }));

test("headings get the ids GitHub gives them", () => {
  assert.equal(headingSlug("Hand off for production (into the git repository)"), "hand-off-for-production-into-the-git-repository");
  assert.equal(headingSlug("The `Share` menu"), "the-share-menu");
  assert.equal(headingSlug("Project specification (for the people who build it)"), "project-specification-for-the-people-who-build-it");
});

test("plain text drops the marks of Markdown and keeps the words of links", () => {
  assert.equal(plainText("**Bold** and `code` and [a link](x.md#y)").trim(), "Bold and code and a link");
});

test("chapters: README first as Overview, the others in order; sections by heading, repeated ones numbered", () => {
  const ch = parseChapters([
    { file: "02-b.md", text: "# 2. Second\n\nIntro.\n\n## Notes\n\nOne.\n\n## Notes\n\nTwo.\n\n```\n# not a heading\n```" },
    { file: "README.md", text: "# Guide\n\nHello." },
    { file: "01-a.md", text: "# 1. First\n\n## A part\n\nText." },
    { file: "x.md.bak", text: "# ignored" },
  ]);
  assert.deepEqual(ch.map((c) => [c.file, c.title]), [["README.md", "Overview"], ["01-a.md", "First"], ["02-b.md", "Second"]]);
  assert.deepEqual(ch[2].sections.map((s) => s.id), ["", "notes", "notes-1"]);
  assert.match(ch[2].sections[2].text, /not a heading/); // a # inside a code block is not a heading
});

test("search needs every word, ranks headings first and ignores accents and case", () => {
  const ch = parseChapters([
    { file: "01-a.md", text: "# 1. Export\n\n## Update from code\n\nBrings the code into the screen.\n\n## Other\n\nThe screen can be updated; code elsewhere." },
    { file: "02-b.md", text: "# 2. Notes\n\n## Poznámky\n\nŽádný kód." },
  ]);
  const r = searchDocs(ch, "update CODE");
  assert.equal(r[0].id, "update-from-code");
  assert.equal(r[0].chapter, "Export");
  assert.ok(r.every((x) => x.file === "01-a.md"));
  assert.equal(searchDocs(ch, "poznamky")[0].title, "Poznámky");
  assert.deepEqual(searchDocs(ch, "x"), []);
  assert.deepEqual(queryWords("a Update, update!"), ["update"]);
  assert.deepEqual(queryWords("update from the code"), ["update", "code"]); // common words are left out
  assert.deepEqual(queryWords("from"), ["from"]); // unless nothing else is left
});

test("a snippet is cut around the first word found", () => {
  const s = snippet("word ".repeat(80) + "needle " + "tail ".repeat(80), ["needle"], 60);
  assert.match(s, /^….*needle.*…$/);
  assert.ok(s.length <= 64);
});

test("links between the chapters become links of the guide; web links stay external", () => {
  const html = markdownDoc("See [Export](08-export-and-share.md#hand-off), [here](#notes) and [web](https://example.com).", { docLinks: true });
  assert.match(html, /<a data-doc="08-export-and-share.md" data-anchor="hand-off">Export<\/a>/);
  assert.match(html, /<a data-doc="" data-anchor="notes">here<\/a>/);
  assert.match(html, /<a data-href="https:\/\/example.com">web<\/a>/);
  assert.doesNotMatch(markdownDoc("[x](a.md)"), /data-doc/); // only in the guide
});

test("the real guide: every chapter has a title, and every link between chapters points to a heading that exists", () => {
  const ch = parseChapters(real());
  assert.ok(ch.length >= 10);
  assert.ok(ch.every((c) => c.title && c.sections.length));
  const ids = new Map(ch.map((c) => [c.file, new Set(c.sections.map((s) => s.id))]));
  const broken = [];
  for (const c of ch) for (const m of c.text.matchAll(/\]\(([\w.-]+\.md)?#([\w-]+)\)/g)) { const f = m[1] ?? c.file; if (!ids.get(f)?.has(m[2])) broken.push(`${c.file} → ${f}#${m[2]}`); }
  assert.deepEqual(broken, []);
  assert.ok(searchDocs(ch, "update from code").length > 0);
});

test("the index of the Help menu search: one entry per section, keys the guide opens, labels with the chapter", async () => {
  const { helpSearchEntries } = await import("../src/renderer/helpDocs.js");
  const e = helpSearchEntries(parseChapters([{ file: "08-x.md", text: "# 8. Export\n\nIntro.\n\n### Update from code\n\nBrings the code." }]));
  assert.deepEqual(e.map((x) => [x.key, x.label]), [["08-x.md", "Export"], ["08-x.md#update-from-code", "Update from code — Export"]]);
  assert.equal(e[1].chapter, "Export");
});

test("the native module of the Help menu search loads (macOS, when built) and refuses to install outside the app", { skip: process.platform !== "darwin" || !fs.existsSync(path.join(import.meta.dirname, "..", "native", "helpsearch", "build", "helpsearch.node")) }, async () => {
  const { createRequire } = await import("node:module");
  const native = createRequire(import.meta.url)("../native/helpsearch/build/helpsearch.node");
  assert.equal(typeof native.install, "function");
  assert.throws(() => native.install("x", [], () => {}), /entries must be an array/);
  assert.throws(() => native.install([], [], () => {}), /NSApplication is not running/);
});
