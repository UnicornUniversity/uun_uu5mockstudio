/**
 * Variants of a screen: "Make 3 versions that differ in layout" as one request to the agent, so a UX designer can compare ideas side by side.
 * `buildVariantsPrompt` is pure; the dialog asks how many and what should differ and hands the answer to `onDone`.
 */
export const VARIANT_ASPECTS = {
  layout: { label: "Layout", hint: "How the content is arranged: columns, grouping, navigation", text: "the layout: how the content is arranged, grouped and navigated" },
  style: { label: "Visual style", hint: "Density, colours, emphasis, shapes; the structure stays", text: "the visual style (density, colours, emphasis, shapes) while the structure stays" },
  structure: { label: "Information", hint: "What comes first and what hides behind an action", text: "how the information is organised: what is shown first and what is behind an action" },
  custom: { label: "Something else", hint: "Say what should differ", text: "" },
};
export const VARIANT_COUNTS = [2, 3, 4];

const base = (file) => String(file).replace(/\.html$/, "");
/** The request: variants of `file`, each in its own file `<name>-a.html`…, differing in `aspect`; the original is left alone. */
export function buildVariantsPrompt({ file, count = 3, aspect = "layout", custom = "" } = {}) {
  const n = Math.max(2, Math.min(4, Math.round(count) || 3)), b = base(file);
  const what = aspect === "custom" ? (String(custom).trim() || VARIANT_ASPECTS.layout.text) : (VARIANT_ASPECTS[aspect] ?? VARIANT_ASPECTS.layout).text;
  const names = Array.from({ length: n }, (_, i) => `${b}-${String.fromCharCode(97 + i)}.html`);
  return `Make ${n} variants of the screen @${b} and write them as ${names.join(", ")}. The variants must clearly differ from each other in ${what}. Keep the same content, the same business rules and the same libraries, and do not change ${file}. When they are written, say in one sentence per variant how it differs, so the user can choose.`;
}
/** `file` is a variant (`room-list-b.html`) of a screen that exists (`room-list.html`): { base, others } (the other variants), else null. */
export function variantInfo(file, files) {
  const m = /^(.+)-([a-z])\.html$/.exec(file);
  if (!m || !files.includes(`${m[1]}.html`)) return null;
  const re = new RegExp(`^${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[a-z]\\.html$`);
  return { base: `${m[1]}.html`, others: files.filter((f) => f !== file && re.test(f)) };
}
export const variantNames = (file, count) => Array.from({ length: count }, (_, i) => `${base(file)}-${String.fromCharCode(97 + i)}.html`);
