/**
 * The JSX a component of the catalogue gets when it is dropped onto a screen. The catalogue (the wiki of the uu5-development plugin) has
 * names, descriptions and props but no example, so there are three layers:
 *  1. CURATED: hand-written snippets of the components people drop most, with content that shows something and props that are known to be valid.
 *  2. generateSnippet: from the documented props: a required prop gets a neutral value of its type; a component that needs data or code
 *     the mockup cannot guess (a required object, an element, a reference) gets none.
 *  3. none: the drop is given to the agent (renderer.js `askAgentToAdd`).
 */

/** Libraries whose default import works in every mockup without more dependencies (the others need `uu5DemoDependencies` in the page). */
export const CORE_IMPORTS = { Uu5Elements: "uu5g05-elements", Uu5Forms: "uu5g05-forms" };

const E = "Uu5Elements", F = "Uu5Forms";
export const CURATED = {
  [`${E}.Text`]: `<${E}.Text>Text</${E}.Text>`,
  [`${E}.Block`]: `<${E}.Block header="Block" headerType="heading" level={2} borderRadius="moderate">\n  <${E}.Text>Content</${E}.Text>\n</${E}.Block>`,
  [`${E}.Box`]: `<${E}.Box>\n  <${E}.Text>Content</${E}.Text>\n</${E}.Box>`,
  [`${E}.Button`]: `<${E}.Button colorScheme="primary" significance="highlighted">Button</${E}.Button>`,
  [`${E}.Link`]: `<${E}.Link href="#">Link</${E}.Link>`,
  [`${E}.Line`]: `<${E}.Line direction="horizontal" />`,
  [`${E}.Badge`]: `<${E}.Badge>Badge</${E}.Badge>`,
  [`${E}.Icon`]: `<${E}.Icon icon="uugds-info" />`,
  [`${E}.InfoItem`]: `<${E}.InfoItem icon="uugds-account" title="Title" subtitle="Subtitle" />`,
  [`${E}.ActionGroup`]: `<${E}.ActionGroup itemList={[\n  { icon: "uugds-plus", children: "Create", colorScheme: "primary", significance: "highlighted" },\n  { icon: "uugds-edit", children: "Edit" },\n]} />`,
  [`${E}.Tabs`]: `<${E}.Tabs itemList={[\n  { label: "First", children: <${E}.Text>First tab</${E}.Text> },\n  { label: "Second", children: <${E}.Text>Second tab</${E}.Text> },\n]} />`,
  [`${E}.Accordion`]: `<${E}.Accordion itemList={[\n  { header: "First", children: <${E}.Text>First content</${E}.Text> },\n  { header: "Second", children: <${E}.Text>Second content</${E}.Text> },\n]} />`,
  [`${E}.Panel`]: `<${E}.Panel header="Panel">\n  <${E}.Text>Content</${E}.Text>\n</${E}.Panel>`,
  [`${E}.MenuList`]: `<${E}.MenuList itemList={[\n  { children: "First", icon: "uugds-home" },\n  { children: "Second", icon: "uugds-settings" },\n]} />`,
  [`${F}.FormText`]: `<${F}.FormText name="text" label="Text" />`,
  [`${F}.FormTextArea`]: `<${F}.FormTextArea name="description" label="Description" />`,
  [`${F}.FormNumber`]: `<${F}.FormNumber name="number" label="Number" />`,
  [`${F}.FormCheckbox`]: `<${F}.FormCheckbox name="checked" label="Checkbox" />`,
  [`${F}.FormSelect`]: `<${F}.FormSelect name="select" label="Select" itemList={[\n  { value: "a", children: "Option A" },\n  { value: "b", children: "Option B" },\n]} />`,
  [`${F}.SubmitButton`]: `<${F}.SubmitButton>Save</${F}.SubmitButton>`,
  [`${F}.CancelButton`]: `<${F}.CancelButton>Cancel</${F}.CancelButton>`,
  [`${F}.Form`]: `<${F}.Form onSubmit={(e) => console.log("Submit:", e.data.value)}>\n  <${F}.FormText name="text" label="Text" />\n  <${F}.SubmitButton>Save</${F}.SubmitButton>\n</${F}.Form>`,
};

const label = (s) => String(s).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const last = (name) => name.slice(name.lastIndexOf(".") + 1);

/** A neutral JSX attribute of a required prop, or null when no honest value exists (then the component is left to the agent). */
function requiredAttr(p, component) {
  if (p.name === "name" && /string/.test(p.type)) return `name="${last(component).replace(/^Form/, "").replace(/^./, (c) => c.toLowerCase()) || "field"}"`; // the key of a form field
  if (p.enum?.length) return `${p.name}="${p.default && p.enum.includes(p.default) ? p.default : p.enum[0]}"`;
  const types = p.type.split("|").map((t) => t.trim());
  const has = (t) => types.includes(t);
  if (has("string") || has("lsi") || has("node")) return `${p.name}="${label(p.name)}"`;
  if (has("bool")) return `${p.name}={${p.default === "true"}}`;
  if (has("number")) return `${p.name}={${Number.isFinite(Number(p.default)) && p.default !== null ? Number(p.default) : 0}}`;
  if (has("func")) return `${p.name}={() => {}}`;
  if (types.every((t) => /\[\]$/.test(t) || t === "array")) return `${p.name}={[]}`;
  return null;
}

/** From the documented props of a component (`parseDoc` result): `<Name required="…" />`, with a text child when it takes one. null: cannot be built. */
export function generateSnippet(name, doc) {
  if (!doc) return null;
  const attrs = [];
  for (const p of doc.props.filter((x) => x.required && x.name !== "children")) {
    const a = requiredAttr(p, name);
    if (a === null) return null;
    attrs.push(a);
  }
  const children = doc.props.find((p) => p.name === "children"), open = `<${name}${attrs.length ? " " + attrs.join(" ") : ""}`;
  const text = children && children.type.split("|").some((t) => ["string", "lsi"].includes(t.trim()));
  return text ? `${open}>${label(last(name))}</${name}>` : `${open} />`;
}

/** The snippet for a component name: { snippet, source: "curated" | "generated" }, or null when the agent has to do it. `docs` = createDocs(). */
export function snippetFor(name, docs) {
  if (CURATED[name]) return { snippet: CURATED[name], source: "curated" };
  const s = generateSnippet(name, docs?.get(name) ?? null);
  return s ? { snippet: s, source: "generated" } : null;
}
