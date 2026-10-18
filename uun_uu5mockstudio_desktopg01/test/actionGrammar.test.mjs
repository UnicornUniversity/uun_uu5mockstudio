import { test } from "node:test";
import assert from "node:assert/strict";
import { listKind, actionFields, itemLabel, itemTags, newAction, isComponentItem } from "../src/renderer/actionGrammar.js";

const item = (attrs, kind = "object", text = "") => ({ kind, text, attrs: attrs.map(([name, value, type = typeof value === "string" ? "string" : typeof value === "boolean" ? "boolean" : "code", code]) => ({ name, value, type, code: code ?? String(value) })) });

test("which list props hold actions", () => {
  assert.equal(listKind("actionList", "Uu5Elements.Block"), "action");
  assert.equal(listKind("iconRightList", "Uu5Forms.FormText"), "action");
  assert.equal(listKind("itemList", "Uu5Elements.ActionGroup"), "action");
  assert.equal(listKind("itemList", "Uu5Elements.Dropdown"), "action");
  assert.equal(listKind("itemList", "Uu5Elements.Tabs"), null, "tabs have their own grammar");
  assert.equal(listKind("tabList", "Uu5Elements.Tabs"), null);
});

test("the fields come in the order people think of, with values from the reference and the palettes", () => {
  const f = actionFields({ props: [{ name: "significance", enum: ["common", "highlighted"], description: "How it looks." }, { name: "colorScheme", enum: ["x"] }] }, { colorScheme: { group: ["primary", "negative"] } });
  assert.deepEqual(f.map((x) => x.name).slice(0, 7), ["children", "icon", "tooltip", "significance", "colorScheme", "disabled", "onClick"]);
  assert.deepEqual(f.find((x) => x.name === "significance").options, ["common", "highlighted"]);
  assert.deepEqual(f.find((x) => x.name === "colorScheme").options, ["primary", "negative"]);
  assert.equal(f.find((x) => x.name === "significance").hint, "How it looks.");
  assert.ok(f.find((x) => x.name === "collapsed").kind === "collapsed" && f.find((x) => x.name === "itemList").kind === "submenu");
  assert.deepEqual(actionFields(null).find((x) => x.name === "significance").options, ["common", "highlighted", "distinct", "subdued"]);
});

test("a row of the list: text, then tooltip, icon or code; tags", () => {
  assert.equal(itemLabel(item([["children", "Add room"], ["icon", "uugds-plus"]])), "Add room");
  assert.equal(itemLabel(item([["tooltip", "Edit"], ["icon", "uugds-pencil"]])), "Edit");
  assert.equal(itemLabel(item([["icon", "uugds-delete"]])), "uugds-delete");
  assert.equal(itemLabel(item([["children", "<Lsi lsi={{ en: 'A' }} />", "code", "<Lsi lsi={{ en: 'A' }} />"]])), "<Lsi lsi={{ en: 'A' }} />");
  const lsi = item([["children", 't("Ano", "Yes")', "code", 't("Ano", "Yes")']]); lsi.attrs[0].resolved = { kind: "lsi", via: "t(…)", langs: [{ lang: "cs", value: "Ano" }, { lang: "en", value: "Yes" }] };
  assert.equal(itemLabel(lsi), "Ano", "an LSI shows its text, not the code");
  assert.equal(itemLabel(item([["divider", true]])), "— divider —");
  assert.equal(itemLabel({ kind: "other", text: "...actions" }), "...actions");
  assert.equal(itemLabel(item([])), "(no text)");
  assert.deepEqual(itemTags(item([["significance", "highlighted"], ["colorScheme", "negative"], ["collapsed", true], ["primary", true], ["itemList", "[]", "code"]])), ["highlighted", "negative", "in the menu", "primary", "submenu"]);
  assert.deepEqual(itemTags(item([["collapsed", "never"]])), []);
  assert.deepEqual(newAction().map((p) => p.name), ["children", "onClick"]);
});

test("an item that is a component is shown as one", () => {
  const c = item([["component", "<StateBadge>x</StateBadge>", "code", "cond ? (<StateBadge colorScheme=\"final\">x</StateBadge>) : <Other />"]]);
  assert.equal(isComponentItem(c), true); assert.equal(isComponentItem(item([["children", "A"]])), false);
  assert.equal(itemLabel(c), "◧ StateBadge"); assert.deepEqual(itemTags(c), ["component"]);
  assert.equal(itemLabel(item([["component", "x", "code", "renderIt()"]])), "◧ component");
});
