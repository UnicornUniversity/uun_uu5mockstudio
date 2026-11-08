/**
 * The flow between screens: which screen points to which. A screen points to another one when its source names the other file as a
 * string (`href="room-detail.html"`, `location.href = "room-detail.html"`, `navigate("./room-detail.html#top")`). Used to draw arrows
 * between the frames on the canvas, and in the handoff specification.
 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `texts`: { "a.html": source, ... } -> [{ from, to }] without self links and duplicates, in the order found. */
export function findFlowEdges(texts) {
  const names = Object.keys(texts), edges = [], seen = new Set();
  for (const from of names) {
    const src = String(texts[from] ?? "");
    for (const to of names) {
      if (to === from || seen.has(`${from}>${to}`)) continue;
      if (new RegExp(`["'\`](?:\\.{0,2}/)?${esc(to)}(?:[#?][^"'\`]*)?["'\`]`).test(src)) { seen.add(`${from}>${to}`); edges.push({ from, to }); }
    }
  }
  return edges;
}
