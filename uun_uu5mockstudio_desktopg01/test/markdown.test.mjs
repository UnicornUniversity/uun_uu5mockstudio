import { test } from "node:test";
import assert from "node:assert/strict";
import { markdown, esc } from "../src/renderer/markdown.js";

test("html is escaped before anything else", () => {
  const out = markdown('<img src=x onerror="alert(1)"> & <script>x</script>');
  assert.ok(!out.includes("<img") && !out.includes("<script"));
  assert.match(out, /&lt;img/);
  assert.equal(esc('"&<>'), "&quot;&amp;&lt;&gt;");
});

test("inline code, bold and italic", () => {
  assert.equal(markdown("a `x<y` **b** *c*"), "<p>a <code>x&lt;y</code> <strong>b</strong> <em>c</em></p>");
});

test("lists and headings", () => {
  assert.equal(markdown("- a\n- b\n\n1. c"), "<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>");
  assert.equal(markdown("## Title"), "<h3>Title</h3>");
});

test("fenced code keeps content literal, also when unterminated", () => {
  assert.equal(markdown("```js\nconst a = '<b>';\n```"), "<pre><code>const a = '&lt;b&gt;';</code></pre>");
  assert.match(markdown("```\nstreaming"), /<pre><code>streaming<\/code><\/pre>/);
});

test("only https links become anchors", () => {
  assert.match(markdown("[docs](https://example.com/a?b=1)"), /<a data-href="https:\/\/example\.com\/a\?b=1">docs<\/a>/);
  assert.ok(!markdown("[x](javascript:alert(1))").includes("<a"));
  assert.ok(!markdown("[x](http://example.com)").includes("<a"));
});

import { markdownDoc } from "../src/renderer/markdown.js";

test("markdownDoc: heading levels, nested lists, checklists", () => {
  assert.equal(markdownDoc("# A\n### C"), "<h1>A</h1><h3>C</h3>");
  assert.equal(markdownDoc("- a\n  - b\n- c"), "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
  assert.match(markdownDoc("- [x] done\n- [ ] open"), /<li class="task"><input type="checkbox" disabled checked aria-label="done"> done<\/li><li class="task"><input type="checkbox" disabled aria-label="open"> open<\/li>/);
});

test("markdownDoc: tables, quotes, rules and escaping", () => {
  assert.equal(markdownDoc("| a | b |\n|---|---|\n| 1 | <x> |"), "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>&lt;x&gt;</td></tr></tbody></table>");
  assert.equal(markdownDoc("> q\n\n---"), "<blockquote>q</blockquote><hr>");
  assert.ok(!markdownDoc("<script>x</script>").includes("<script"));
});

test("markdownDoc: [[screen.html]] links focus a screen, a missing one is plain", () => {
  assert.match(markdownDoc("see [[index.html]]"), /<a data-screen="index\.html">index<\/a>/);
  assert.match(markdownDoc("see [[gone.html]]", { known: () => false }), /<code>gone\.html<\/code>/);
});

test("markdownDoc: ordered after unordered list and code fences", () => {
  assert.equal(markdownDoc("- a\n\n1. b"), "<ul><li>a</li></ul><ol><li>b</li></ol>");
  assert.equal(markdownDoc("```js\nx<y\n```"), "<pre><code>x&lt;y</code></pre>");
});
