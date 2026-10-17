/**
 * BUSINESS_RULES.md as a list of lines the rendered view can edit one by one. The text stays the single source of truth:
 * every edit rewrites exactly one line (or removes it), so everything the user or the agent wrote by hand survives.
 */
const RULE = /^(\s*[-*]\s+(?:(R-\d+)(?:\s+\(screen:\s*([^)]*)\))?\s+)?)(.*)$/;

/** [{ i, kind: "h1"|"h2"|"item"|"text"|"blank"|"code", ... }]; an item has `prefix` (kept as it is), `id`, `screen` and the editable `text`. */
export function parseRules(md) {
  let code = false;
  return String(md ?? "").split("\n").map((line, i) => {
    if (/^\s*```/.test(line)) { code = !code; return { i, kind: "code", text: line }; }
    if (code) return { i, kind: "code", text: line };
    let m;
    if ((m = line.match(/^#\s+(.*)/))) return { i, kind: "h1", text: m[1] };
    if ((m = line.match(/^##\s+(.*)/))) return { i, kind: "h2", text: m[1] };
    if ((m = line.match(RULE))) return { i, kind: "item", prefix: m[1], id: m[2] ?? "", screen: m[3]?.trim() ?? "", text: m[4] };
    return line.trim() ? { i, kind: "text", text: line } : { i, kind: "blank", text: "" };
  });
}

const oneLine = (t) => String(t).replace(/\s+/g, " ").trim();

/** Replaces the text of the item on line `i` (empty text removes the line). Returns the new markdown. */
export function editItem(md, i, text) {
  const lines = String(md).split("\n"), it = parseRules(md)[i];
  if (!it || it.kind !== "item") return md;
  const t = oneLine(text);
  if (!t) lines.splice(i, 1); else lines[i] = it.prefix + t;
  return lines.join("\n");
}
export const deleteItem = (md, i) => editItem(md, i, "");

/** Number of rules (items with an R-id), for the badge on the toolbar icon. */
export const countRules = (md) => parseRules(md).filter((l) => l.kind === "item" && l.id).length;
