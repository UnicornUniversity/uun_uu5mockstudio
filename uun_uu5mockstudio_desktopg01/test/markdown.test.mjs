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
