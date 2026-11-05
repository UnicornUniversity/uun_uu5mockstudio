import test from "node:test";
import assert from "node:assert/strict";
import { parseExpression } from "@babel/parser";
import { CURATED, CORE_IMPORTS, generateSnippet, snippetFor } from "../src/main/componentSnippets.mjs";
import { insertElement, parseElements } from "../src/main/jsxSource.mjs";
import { createDocs, parseDoc } from "../src/main/uu5Docs.mjs";

const page = (imports = `import Uu5Elements from "uu5g05-elements";`) => `<script type="text/babel">
  import { Utils } from "uu5g05";
  ${imports}
  function Page() {
    return (
      <div>
        <Uu5Elements.Text>A</Uu5Elements.Text>
      </div>
    );
  }
</script>`;
const doc = (rows, children = "") => parseDoc(`# X\n\nDesc.\n\n| Name | Type | Required | Default | Description |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}${children ? "\n" + children : ""}\n`);

test("every curated snippet is one JSX element and can be put into a screen (the libraries of the core are imported when missing, the Bricks are imported by a content page)", () => {
  for (const [name, snippet] of Object.entries(CURATED)) {
    assert.equal(parseExpression(snippet, { plugins: ["jsx"] }).type, "JSXElement", name);
    assert.ok(snippet.startsWith(`<${name}`), `${name} snippet starts with its own tag`);
    const html = page(name.startsWith("Uu5Bricks.") ? `import Uu5Elements from "uu5g05-elements";\n  import * as Uu5Bricks from "uu5bricksg01";` : undefined), target = parseElements(html).find((e) => e.name === "Uu5Elements.Text").ordinal;
    const r = insertElement(html, { target, position: "after", snippet, imports: CORE_IMPORTS });
    assert.ok(!r.error && !r.missingImport, `${name}: ${r.error ?? r.missingImport}`);
    assert.ok(r.html.includes(snippet.split("\n")[0]), name);
  }
});

test("the import of a core library is added after the last import; another library is only reported", () => {
  const html = page(), target = parseElements(html).find((e) => e.name === "Uu5Elements.Text").ordinal;
  let r = insertElement(html, { target, position: "after", snippet: CURATED["Uu5Forms.FormText"], imports: CORE_IMPORTS });
  assert.equal(r.addedImport, "Uu5Forms"); assert.match(r.html, /import Uu5Elements from "uu5g05-elements";\n  import Uu5Forms from "uu5g05-forms";\n  function Page/);
  assert.equal(r.missingImport, undefined);
  r = insertElement(r.html, { target, position: "after", snippet: CURATED["Uu5Forms.FormText"], imports: CORE_IMPORTS });
  assert.equal(r.addedImport, undefined, "an import that is there is not added twice"); assert.equal((r.html.match(/import Uu5Forms/g) ?? []).length, 1);
  r = insertElement(html, { target, position: "after", snippet: "<Uu5TilesElements.Table />", imports: CORE_IMPORTS });
  assert.equal(r.missingImport, "Uu5TilesElements"); assert.ok(!r.html.includes("import Uu5TilesElements"));
});

test("generateSnippet: neutral values for required props, a text child when the component takes one, nothing when it needs data it cannot invent", () => {
  assert.equal(generateSnippet("Lib.A", doc(["| `a` | `string` | no | | x |"])), "<Lib.A />");
  assert.equal(generateSnippet("Lib.Pagination", doc(["| `index` | `number` | yes | | x |", "| `count` | `number` | yes | | x |", "| `onChange` | `func` | yes | | x |"])), '<Lib.Pagination index={0} count={0} onChange={() => {}} />');
  assert.equal(generateSnippet("Lib.F", doc(["| `name` | `string` | yes | | x |", "| `itemList` | `object[]` | yes | | x |"])), '<Lib.F name="f" itemList={[{ children: "First" }, { children: "Second" }]} />');
  assert.equal(generateSnippet("Uu5Forms.Radios", doc(["| `itemList` | `object[]` | yes | | x |", "| `label` | `lsi \\| node` | no | | x |"])), '<Uu5Forms.Radios itemList={[{ value: "a", children: "Option A" }, { value: "b", children: "Option B" }]} label="Radios" />');
  assert.equal(generateSnippet("Lib.FormDate", doc(["| `name` | `string` | yes | | x |"])), '<Lib.FormDate name="date" />');
  assert.equal(generateSnippet("Lib.S", doc(["| `size` | `xs\\|s\\|m` | yes | `s` | x |"])), '<Lib.S size="s" />');
  assert.equal(generateSnippet("Lib.T", doc(["| `children` | `string \\| node` | no | | x |"])), "<Lib.T>T</Lib.T>");
  assert.equal(generateSnippet("Lib.B", doc(["| `children` | `node` | no | | x |"])), "<Lib.B />");
  assert.equal(generateSnippet("Lib.O", doc(["| `data` | `object` | yes | | x |"])), null);
  assert.equal(generateSnippet("Lib.R", doc(["| `elementRef` | `ref` | yes | | x |"])), null);
  assert.equal(generateSnippet("Lib.Missing", null), null);
});

test("snippetFor: the curated one first, then the generated one, then nothing (the agent)", () => {
  const docs = { get: (n) => (n === "Lib.G" ? doc(["| `x` | `string` | no | | x |"]) : null) };
  assert.deepEqual(snippetFor("Uu5Elements.Text", docs), { snippet: CURATED["Uu5Elements.Text"], source: "curated" });
  assert.deepEqual(snippetFor("Lib.G", docs), { snippet: "<Lib.G />", source: "generated" });
  assert.equal(snippetFor("Lib.None", docs), null);
});

test("the curated names are documented components of the plugin (checked when the plugin is installed)", (t) => {
  const docs = createDocs();
  if (!docs.available()) return t.skip("the uu5-development plugin is not installed");
  const gone = Object.keys(CURATED).filter((n) => !docs.has(n));
  assert.deepEqual(gone, [], "curated components the documentation does not know (renamed or removed?)");
});
