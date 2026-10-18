/**
 * The grammar of an action: an item of `actionList` (Block, Tile, Dialog, Modal, …), `itemList` of ActionGroup / Dropdown and
 * `iconRightList` of the form inputs. An item is an object with the props of Uu5Elements.Button plus the ones that ActionGroup adds
 * (primary, collapsed, collapsedIcon, collapsedChildren, order, divider, component) and, for a submenu, `itemList`.
 */
const short = (name) => String(name ?? "").replace(/^(Uu5|Plus4U5)[A-Za-z0-9]*\./, "");

/** "action" when the list prop holds actions of this grammar (an `itemList` only of the components that render it as actions). */
export function listKind(prop, componentName) {
  if (prop === "actionList" || prop === "iconRightList") return "action";
  if (prop === "itemList" && ["ActionGroup", "Dropdown", "ContextMenu"].includes(short(componentName))) return "action";
  return null;
}

export const COLLAPSED_OPTIONS = [["", "automatic"], ["always", "always in the menu"], ["never", "never in the menu"], ["duplicated", "also in the menu"]];
const SIGNIFICANCE = ["common", "highlighted", "distinct", "subdued"];

/**
 * The fields of the form in the order people think of them. `doc` = the parsed reference of Uu5Elements.Button (or null),
 * `palettes` = the palettes of the mockup ({ colorScheme: [...] | { group: [...] } }).
 */
export function actionFields(doc, palettes = {}) {
  const p = (name) => doc?.props?.find((x) => x.name === name);
  const flat = (o) => (Array.isArray(o) ? o : o ? Object.values(o).flat() : null);
  const hint = (name, extra = "") => [p(name)?.description, extra].filter(Boolean).join(" ").slice(0, 400);
  return [
    { name: "children", label: "Text", kind: "text", hint: hint("children", "A text, or code such as <Lsi lsi={…} /> for a text in several languages.") },
    { name: "icon", label: "Icon", kind: "icon", hint: hint("icon") },
    { name: "tooltip", label: "Tooltip", kind: "text", hint: hint("tooltip") },
    { name: "significance", label: "Significance", kind: "select", options: p("significance")?.enum ?? SIGNIFICANCE, hint: hint("significance") },
    { name: "colorScheme", label: "Color", kind: "select", options: flat(palettes.colorScheme) ?? p("colorScheme")?.enum ?? [], hint: hint("colorScheme") },
    { name: "disabled", label: "Disabled", kind: "bool", hint: hint("disabled") },
    { name: "onClick", label: "On click", kind: "code", hint: hint("onClick", "Code, for example () => setOpen(true).") },
    { name: "collapsed", label: "In the menu", kind: "collapsed", hint: "ActionGroup: whether the action always stays visible, always goes into the menu, or is collapsed only when there is no space." },
    { name: "primary", label: "Primary", kind: "bool", hint: "ActionGroup: primary actions are collapsed later than the others." },
    { name: "divider", label: "Divider", kind: "bool", hint: "ActionGroup: the item is a divider line, not an action." },
    { name: "order", label: "Order", kind: "number", hint: "ActionGroup: 1 puts the action to the right of the automatic menu." },
    { name: "collapsedIcon", label: "Icon in the menu", kind: "icon", hint: "ActionGroup: icon used when the action is collapsed into the menu." },
    { name: "collapsedChildren", label: "Text in the menu", kind: "text", hint: "ActionGroup: text used when the action is collapsed into the menu." },
    { name: "itemList", label: "Submenu", kind: "submenu", hint: "An action with its own itemList is rendered as a dropdown. Edit it as code." },
  ];
}

const attrOf = (item, name) => item.attrs?.find((a) => a.name === name);
const compact = (s, n = 38) => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** An item that is a component (`{ component: <StateBadge /> }`), not a button: it has none of the button props. */
export const isComponentItem = (item) => item.kind === "object" && Boolean(attrOf(item, "component"));

/** What the list shows for an item: its text, otherwise its tooltip, its icon or its code. */
export function itemLabel(item) {
  if (item.kind !== "object") return compact(item.text) || "(item)";
  if (isComponentItem(item)) { const tag = /<([A-Z][\w.]*)/.exec(attrOf(item, "component").code ?? "")?.[1]; return tag ? `◧ ${tag}` : "◧ component"; }
  const text = attrOf(item, "children"), tip = attrOf(item, "tooltip"), icon = attrOf(item, "icon");
  const val = (a) => (a?.resolved?.langs?.[0] ? a.resolved.langs[0].value : a && a.type !== "code" && a.value != null && a.value !== "" ? String(a.value) : null); // an LSI shows its first language
  if (attrOf(item, "divider")?.value === true) return "— divider —";
  return compact(val(text) ?? (text ? text.code : null) ?? val(tip) ?? (icon ? String(icon.value) : "") ?? "") || "(no text)";
}

/** Small labels under the text of an item in the list. */
export function itemTags(item) {
  const tags = [], v = (n) => attrOf(item, n);
  if (v("significance") && v("significance").type !== "code") tags.push(String(v("significance").value));
  if (v("colorScheme") && v("colorScheme").type !== "code") tags.push(String(v("colorScheme").value));
  if (v("collapsed") && v("collapsed").value !== false && v("collapsed").value !== "never") tags.push("in the menu");
  if (v("primary")?.value === true) tags.push("primary");
  if (v("disabled")?.value === true) tags.push("disabled");
  if (v("itemList")) tags.push("submenu");
  if (isComponentItem(item)) tags.push("component");
  return tags;
}

/** The first version of a new action: a text and a click handler to fill in. */
export const newAction = () => [{ name: "children", type: "string", value: "New action" }, { name: "onClick", type: "code", value: "() => {}" }];
