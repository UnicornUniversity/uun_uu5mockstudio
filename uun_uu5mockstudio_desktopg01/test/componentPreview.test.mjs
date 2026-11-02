import test from "node:test";
import assert from "node:assert/strict";
import { previewSnippet, previewPage, previewable } from "../src/main/componentPreview.mjs";

const docs = { get: () => null };

test("a curated component of a core library has a preview page", () => {
  const html = previewPage("Uu5Elements.Button", docs);
  assert.match(html, /<Uu5Elements\.Button/);
  assert.match(html, /uu5loaderg01/);
  assert.doesNotMatch(html, /<Uu5Forms\.Form>/);
});

test("a form field is shown inside a form", () => {
  assert.match(previewPage("Uu5Forms.FormText", docs), /<Uu5Forms\.Form>\s*<Uu5Forms\.FormText/);
});

test("no preview for another library or a component without a snippet", () => {
  assert.equal(previewSnippet("Plus4U5App.Top", docs), null);
  assert.equal(previewable("Uu5Elements.Unknown", docs), false);
  assert.equal(previewPage("../x", docs), null);
});

test("a bare input (Radios.Input) is shown, the other parts of a component are not", () => {
  assert.ok(previewable("Uu5Elements.Block", docs));
  assert.equal(previewSnippet("Uu5Forms.Date.Picker", docs), null);
  assert.equal(previewSnippet("Uu5Elements.Modal", docs), null);
  const withDoc = { get: (n) => (n === "Uu5Forms.Radios.Input" ? { props: [{ name: "itemList", type: "object[]", required: true }] } : null) };
  assert.match(previewSnippet("Uu5Forms.Radios.Input", withDoc), /^<Uu5Forms\.Radios\.Input itemList=/);
});

test("the Alert has no preview (it shows nothing on its own), the list layouts have", () => {
  assert.equal(previewSnippet("Uu5Elements.Alert", docs), null);
  for (const n of ["Uu5Elements.ListLayout", "Uu5Elements.CollapsibleBox", "Uu5Elements.RichIconGroup", "Uu5Elements.ListItem"]) assert.ok(previewable(n, docs), n);
});

test("a component of another library gets its dependency and import into the page", () => {
  const html = previewPage("Uu5Charts.PieChart", docs);
  assert.match(html, /uu5DemoDependencies = \{"uu5chartsg01":"3\.x"\}/);
  assert.match(html, /from "uu5chartsg01"/);
  assert.equal(previewSnippet("Plus4U5App.Spa", docs), null);
});
