// Annotations: what the user marked for the message being written, each with an optional note.
// A pick of a component in a screen (`kind` "screen", the chip of the chat pick) or a page of a sitemap (`kind` "sitemap").
// A pick without a note is linked in the text as [#n]; an annotation (with a note) carries its own text and is not linked.
// They live until the message is sent: then they go to the agent as context (annotationsContext) and leave the screens and the map.
import { describeForAgent, describePick, agentContext, LEVEL } from "./inspector.js";

export const MAX_ANNOTATIONS = 12;
/** The id of an annotation of a whole map (no page has it; the same as MAP_ID of sitemapView.js). */
export const MAP_WHOLE = "@map";

/** Where a sitemap is: the one of the project, or the one a plan proposes. */
export const mapWhere = (scope) => (scope && scope !== "project" ? `the sitemap proposed in plans/${scope}.md` : "the sitemap of the project (sitemap.json)");

/** The key of an annotation: one per component (or item, or copy) of a screen, one per page of a map. */
export function annotationKey(a) {
  if (a.kind === "sitemap") return `map:${a.scope ?? "project"}#${a.id}`;
  return `${a.file}#${(a.chain ?? []).map((c) => (typeof c === "number" ? c : c.ordinal)).join(",")}|${a.sub ? `${a.sub.prop}[${a.sub.index}]` : ""}|${a.pickKey ?? ""}`;
}

/** One line for the chip and the sent message. */
export function describeAnnotation(a) {
  if (a.kind === "sitemap" && a.id === MAP_WHOLE) return a.scope && a.scope !== "project" ? `the whole map of ${a.scope}` : "the whole sitemap";
  if (a.kind === "sitemap") return `${a.title} (${a.where}) in ${a.scope && a.scope !== "project" ? `the map of ${a.scope}` : "the sitemap"}`;
  return describePick(a);
}

const quote = (t) => `"${String(t).replace(/\s+/g, " ").trim()}"`;

/** One annotation as the agent reads it. */
function forAgent(a) {
  const what = a.kind === "sitemap"
    ? `the page "${a.title}" (type ${a.type}${a.file ? `, screen ${a.file}` : ""}) at ${a.where} in ${mapWhere(a.scope)}.`
    : describeForAgent(a);
  const note = a.note ? `\nThe user's note on it: ${quote(a.note)}` : "";
  const shot = a.shotPath ? `\nA screenshot of it as it looks now: ${a.shotPath} (open it with the Read tool).` : "";
  return `${what}${note}${shot}`;
}

/**
 * What the agent is told about the annotations of a message (null when there are none). Without any note it is the context of the chat
 * pick as before; with notes each item says what it is, the note of the user and where its screenshot is.
 */
export function annotationsContext(list) {
  if (!list?.length) return null;
  if (!list.some((a) => a.note) && list.every((a) => a.kind !== "sitemap")) return agentContext(list);
  const screens = list.some((a) => a.kind !== "sitemap"), linked = list.some((a) => !a.note);
  return `Context: the user annotated ${list.length === 1 ? "one place" : `${list.length} places`} of the design for this request. Each one is what the user marked and the user's note on it; do what each note asks (the text of the request may add to them)` +
    `${linked ? `. Those without a note are written in the text of the request as markers [#n] at the place they refer to` : ""}:\n` +
    list.map((a) => `#${a.ref}) ${forAgent(a)}`).join("\n") + (screens ? `\n${LEVEL}` : "");
}

/** The annotations of the sent message as the chat keeps them (no pictures, only the small thumbnail). */
export const historyOf = (list) => list.map((a) => ({ ref: a.ref, kind: a.kind ?? "screen", label: describeAnnotation(a), note: a.note ?? null, ...(a.thumb ? { thumb: a.thumb } : {}) }));

/** The rectangle of a screenshot of a component: its box with a margin, inside the page (CSS px of the viewport); null when nothing of it is seen. */
export function captureRect(r, view, pad = 8) {
  if (!r || !view) return null;
  const x = Math.max(0, Math.floor(r.x - pad)), y = Math.max(0, Math.floor(r.y - pad));
  const right = Math.min(view.w, Math.ceil(r.x + r.w + pad)), bottom = Math.min(view.h, Math.ceil(r.y + r.h + pad));
  if (right - x < 4 || bottom - y < 4) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** Where the popover goes: below the anchor (above it when there is no room), inside the window. All in px of the window. */
export function popoverSpot(anchor, size, win, gap = 8) {
  const left = Math.max(gap, Math.min(anchor.left, win.w - size.w - gap));
  const below = anchor.bottom + gap, above = anchor.top - gap - size.h;
  const top = below + size.h <= win.h - gap || above < gap ? Math.min(below, win.h - size.h - gap) : above;
  return { left: Math.round(left), top: Math.round(Math.max(gap, top)) };
}

/** The numbers after some were removed: 1…n in the order the places were added. Returns Map(old -> new) of the ones that change. */
export function renumbering(refs) {
  const m = new Map();
  refs.forEach((r, i) => { if (r !== i + 1) m.set(r, i + 1); });
  return m;
}
/** The links [#n] of the text with their new numbers (all at once, so that [#3] -> [#2] does not meet a [#2] -> [#1]). */
export function renumberText(text, map) {
  if (!map?.size) return text;
  return String(text).replace(/\[#(\d+)\]/g, (all, n) => (map.has(Number(n)) ? `[#${map.get(Number(n))}]` : all));
}
