import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseDoc, parseBricksDoc, enumOf, createDocs, findWikiRoot, findBricksRoot } from "../src/main/uu5Docs.mjs";

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

import { describeComponents } from "../src/main/uu5Docs.mjs";

async function fakeWiki() {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiki-"));
  const lib = async (dir, entries) => {
    await mkdir(path.join(root, dir), { recursive: true });
    const idx = {};
    for (const [name, md] of Object.entries(entries)) { const f = `${name.split(".").pop().toLowerCase()}.md`; idx[name] = f; await writeFile(path.join(root, dir, f), md); }
    await writeFile(path.join(root, dir, "_index.json"), JSON.stringify(idx));
  };
  await lib("uu5-elements", { "Uu5Elements.Button": MD, "Uu5Elements.ButtonGroup": "# Uu5Elements.ButtonGroup\n\nGroup of buttons.\n", "Uu5Elements.Block": "# Uu5Elements.Block\n\nBlock with a header.\n" });
  await lib("uu5-forms", { "Uu5Forms.SubmitButton": "# Uu5Forms.SubmitButton\n\nButton that submits the form.\n", "Uu5Forms.Text": "# Uu5Forms.Text\n\nText input with a button.\n" });
  return root;
}

test("list, libraries and search over the wiki", async () => {
  const d = createDocs(await fakeWiki());
  assert.deepEqual(d.libraries(), [{ library: "Uu5Elements", count: 3 }, { library: "Uu5Forms", count: 2 }]);
  assert.equal(d.list().length, 5);
  assert.equal(d.list().find((c) => c.name === "Uu5Elements.Block").description, "Block with a header.");
  // a prefix of the name first, then a part of it, then the description
  assert.deepEqual(d.search("button").map((c) => c.name), ["Uu5Elements.Button", "Uu5Elements.ButtonGroup", "Uu5Forms.SubmitButton", "Uu5Forms.Text"]);
  assert.deepEqual(d.search("Uu5Elements.But").map((c) => c.name), ["Uu5Elements.Button", "Uu5Elements.ButtonGroup"]);
  assert.deepEqual(d.search("button", { library: "Uu5Forms" }).map((c) => c.name), ["Uu5Forms.SubmitButton", "Uu5Forms.Text"]);
  assert.deepEqual(d.search("", { limit: 2 }).map((c) => c.name), ["Uu5Elements.Block", "Uu5Elements.Button"]);
  assert.deepEqual(d.search("zzz"), []);
  assert.equal(createDocs(null).available(), false);
  assert.deepEqual(createDocs(null).search("button"), []);
});

test("describeComponents tells the agent the props and the file to read, and skips unknown names", async () => {
  const d = createDocs(await fakeWiki());
  const t = describeComponents(d, ["Uu5Elements.Button", "Nope.X", "Uu5Elements.Button"]);
  assert.match(t, /^Referenced library components/);
  assert.equal((t.match(/Uu5Elements\.Button –/g) ?? []).length, 1, "a name once");
  assert.match(t, /- significance: common \| highlighted \| distinct = common/);
  assert.match(t, /label \(required\)/);
  assert.match(t, /Reference file .*button\.md/);
  assert.match(t, /Docs: https:\/\/example\.com\/doc/);
  assert.doesNotMatch(t, /Nope/);
  assert.equal(describeComponents(d, ["Nope.X"]), "");
  assert.match(describeComponents(d, ["Uu5Elements.Button"], { maxProps: 2 }), /… 5 more props/);
});

import { listEnumOf } from "../src/main/uu5Docs.mjs";

test("listEnumOf: items of a list prop named in its description", () => {
  assert.deepEqual(listEnumOf("array", 'Supported nesting levels: `"area"`, `"box"`, `"inline"`, `"spot"`, `"modal"`. Declares which display modes.'), ["area", "box", "inline", "spot", "modal"]);
  assert.deepEqual(listEnumOf("string[]", "Possible values: - `uve` - `route` - `area`"), ["uve", "route", "area"]);
  assert.equal(listEnumOf("array", "A list of things."), null);
  assert.equal(listEnumOf("array", 'Only `"one"` is meant.'), null, "a single value is no choice");
  assert.equal(listEnumOf("string", 'Values `"a"`, `"b"`'), null, "not a list type");
  const doc = parseDoc("# X\n\nd\n\n| Name | Type | Required | Default | Description |\n| --- | --- | --- | --- | --- |\n| `levelList` | `array` | no |  | Levels: `\"area\"`, `\"box\"`. |\n");
  assert.deepEqual(doc.props[0].listEnum, ["area", "box"]);
});

const BRICK = `# Uu5Bricks.Tile

Tile — \`Uu5Bricks.Tile\`

| | |
|---|---|
| Library | \`Uu5Bricks\` |
| npm package | \`uu5bricksg01\` |
| Deprecated | no |
| Documentation | https://uuapp.plus4u.net/uu-bookkit-maing01/095c/book/page?code=Uu5BricksTile |

## Description

The Tile component is a box with a header,
a list of links and a footer.

Second paragraph.

## Props

### \`href\`

\`string\` · optional

A url address.

Example: \`href="https://unicorn.com"\`

### \`maxWidth \`

\`unit\` · optional

Trailing space in the registry.

### \`uri\`

\`string\` · **required**

The address.

### \`shape\`

\`"ground" | "interactiveElement"\` · optional · default \`ground\`

The shape.

### \`size\`

\`xs|s|m|l\` · optional · default \`m\`

## Examples

### Example

\`\`\`jsx
<Uu5Bricks.Tile />
\`\`\`
`;

test("parseBricksDoc reads a registry page of the uu5bricks plugin: description, package, props with type, required, default and values", () => {
  const d = parseBricksDoc(BRICK);
  assert.equal(d.title, "Uu5Bricks.Tile");
  assert.equal(d.description, "The Tile component is a box with a header, a list of links and a footer.");
  assert.equal(d.package, "uu5bricksg01");
  assert.equal(d.deprecated, false);
  assert.match(d.url, /code=Uu5BricksTile$/);
  assert.deepEqual(d.props.map((p) => p.name), ["href", "maxWidth", "uri", "shape", "size"]);
  const by = Object.fromEntries(d.props.map((p) => [p.name, p]));
  assert.equal(by.href.description, "A url address.");
  assert.equal(by.uri.required, true);
  assert.deepEqual(by.shape.enum, ["ground", "interactiveElement"]);
  assert.equal(by.shape.default, "ground");
  assert.deepEqual(by.size.enum, ["xs", "s", "m", "l"]);
  assert.equal(parseBricksDoc("# Standard visual props (uu5 Bricks g01)\n\ntext"), null);
  assert.equal(parseBricksDoc(BRICK.replace("| Deprecated | no |", "| Deprecated | **yes**, since 1.3.0 |")).deprecated, true);
});

test("createDocs adds the Bricks of the uu5bricks plugin to the catalogue; pages that are not components are left out", async () => {
  const wiki = await fakeWiki(), bricks = await mkdtemp(path.join(os.tmpdir(), "bricks-"));
  await writeFile(path.join(bricks, "uu5bricks-tile.md"), BRICK);
  await writeFile(path.join(bricks, "uu5-bricks-catalogue.md"), "# uu5 Bricks (g01) — library and component catalogue\n");
  const d = createDocs(wiki, { bricksRoot: bricks });
  assert.deepEqual(d.libraries(), [{ library: "Uu5Bricks", count: 1 }, { library: "Uu5Elements", count: 3 }, { library: "Uu5Forms", count: 2 }]);
  assert.equal(d.get("Uu5Bricks.Tile").props.length, 5);
  assert.equal(d.get("Uu5Elements.Button").props.length, 7); // the wiki is still read with its own parser
  assert.equal(d.file("Uu5Bricks.Tile"), path.join(bricks, "uu5bricks-tile.md"));
  assert.equal(createDocs(wiki).has("Uu5Bricks.Tile"), false); // a wiki given without bricks: only the wiki
  assert.equal(createDocs(null, { bricksRoot: bricks }).available(), true);
});

test("findBricksRoot finds the registry pages of an installed uu5bricks plugin", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "plug-"));
  const raw = path.join(dir, "skills", "uu5bricks-knowledge", "references", "uu5bricks-kb", "raw");
  await mkdir(raw, { recursive: true });
  await writeFile(path.join(dir, "p.json"), JSON.stringify({ plugins: { "uu5bricks@mp": [{ installPath: dir }] } }));
  assert.equal(findBricksRoot({ pluginsFile: path.join(dir, "p.json") }), raw);
  assert.equal(findWikiRoot({ pluginsFile: path.join(dir, "p.json") }), null);
});
