import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseDoc, enumOf, createDocs, findWikiRoot } from "../src/main/uu5Docs.mjs";

const MD = `# Uu5Elements.Button

> Part of [[uu5-elements]]

Button that can invoke any function.

Docs: [https://example.com/doc](https://example.com/doc)

**Props**

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| \`onClick\` | \`func\` | no | \`undefined\` | Called on click. |
| \`colorScheme\` | \`colorScheme\` | no | \`neutral\` | Color. |
| \`significance\` | \`string\` | no | \`common\` | Significance. Available values are: \`common\`, \`highlighted\`, \`distinct\`. |
| \`size\` | \`xxs\\|xs\\|s\\|m\` | no | \`m\` | Size. |
| \`effect\` | \`"ground"\\| "upper"\` | no | | Shadow. |
| \`style\` | \`object \\| string\` | no | | Styles. |
| \`label\` | \`lsi \\| string\` | yes | | Label with a \\| pipe. |

Next section.
`;

test("parseDoc reads the props table with types, defaults and required flags", () => {
  const d = parseDoc(MD);
  assert.equal(d.title, "Uu5Elements.Button"); assert.equal(d.description, "Button that can invoke any function."); assert.equal(d.url, "https://example.com/doc");
  assert.deepEqual(d.props.map((p) => p.name), ["onClick", "colorScheme", "significance", "size", "effect", "style", "label"]);
  const by = Object.fromEntries(d.props.map((p) => [p.name, p]));
  assert.equal(by.onClick.default, null); assert.equal(by.colorScheme.default, "neutral"); assert.equal(by.label.required, true);
  assert.equal(by.style.type, "object | string");
  assert.match(by.label.description, /pipe/);
});

test("enumOf finds allowed values in the type column or the description", () => {
  const by = Object.fromEntries(parseDoc(MD).props.map((p) => [p.name, p]));
  assert.deepEqual(by.size.enum, ["xxs", "xs", "s", "m"]);
  assert.deepEqual(by.effect.enum, ["ground", "upper"]);
  assert.deepEqual(by.significance.enum, ["common", "highlighted", "distinct"]);
  assert.equal(by.style.enum, null); assert.equal(by.onClick.enum, null); assert.equal(by.label.enum, null);
  assert.equal(enumOf("bool", ""), null);
});

test("createDocs resolves components through the _index.json files of a wiki folder", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-"));
  await mkdir(path.join(root, "uu5-elements"));
  await writeFile(path.join(root, "uu5-elements", "_index.json"), JSON.stringify({ "Uu5Elements.Button": "button.md" }));
  await writeFile(path.join(root, "uu5-elements", "button.md"), MD);
  const docs = createDocs(root);
  assert.equal(docs.available(), true);
  assert.equal(docs.get("Uu5Elements.Button").props.length, 7);
  assert.equal(docs.get("Uu5Elements.Nope"), null);
  assert.equal(createDocs(null).available(), false);
});

test("findWikiRoot returns null when the plugin is not installed", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "plug-"));
  assert.equal(findWikiRoot({ pluginsFile: path.join(dir, "missing.json") }), null);
  await writeFile(path.join(dir, "p.json"), JSON.stringify({ plugins: { "other@x": [{ installPath: dir }] } }));
  assert.equal(findWikiRoot({ pluginsFile: path.join(dir, "p.json") }), null);
});

test("enumOf understands bullet lists, 'one of' phrases and skips values that depend on other props", () => {
  assert.deepEqual(enumOf("string", "Card type of the view: - `none` - no shadow, - `full` - box with shadow, - `content` - shadow around content."), ["none", "full", "content"]);
  assert.deepEqual(enumOf("string", "One of `expose`, `interface`, `story` which define set of possibilities."), ["expose", "interface", "story"]);
  assert.deepEqual(enumOf("sizeOf(string)", "Possible values are one of: `start`, `end`, `center`. E.g. `alignItems=\"start\"`"), ["start", "end", "center"]);
  assert.deepEqual(enumOf("string", "Determines where a page opens: - `_blank` - new window, - `_self` - same frame."), ["_blank", "_self"]);
  assert.equal(enumOf("string", "Value of `type` is dependent on `segment`. Values `hero`, `lead` are available for segment `default`. Values `major`, `common` are available for segment `title`."), null);
  assert.equal(enumOf("string", "Only one of `icon`, `iconText` or `imageSrc` can be set."), null);
});
