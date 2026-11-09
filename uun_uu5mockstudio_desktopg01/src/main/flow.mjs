/**
 * The flow between screens: which screen points to which. A screen points to another one when its source names the other file as a
 * string (`href="room-detail.html"`, `location.href = "room-detail.html"`, `navigate("./room-detail.html#top")`). Used to draw arrows
 * between the frames on the canvas, and in the handoff specification.
 *
 * An edge is marked `nav: true` when every link of it is part of a menu (inside <nav>, <header>, <footer>, <aside>, or one of several
 * screen links lying close together). Such links are the same on every screen, so they say nothing about the flow of the feature
 * and the canvas hides them unless asked.
 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MENU_SPAN = 500; // screen links this close to each other (at least MENU_COUNT distinct screens) are a menu
const MENU_COUNT = 3;

function menuRanges(src) {
  const out = [];
  for (const m of src.matchAll(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1\s*>/gi)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** `texts`: { "a.html": source, ... } -> [{ from, to, nav }] without self links and duplicates, in the order found. */
export function findFlowEdges(texts) {
  const names = Object.keys(texts), edges = [];
  for (const from of names) {
    const src = String(texts[from] ?? ""), ranges = menuRanges(src), hits = [];
    for (const name of names) {
      for (const m of src.matchAll(new RegExp(`["'\`](?:\\.{0,2}/)?${esc(name)}(?:[#?][^"'\`]*)?["'\`]`, "g"))) hits.push({ name, at: m.index });
    }
    hits.sort((a, b) => a.at - b.at);
    for (const h of hits) {
      const near = new Set(hits.filter((o) => Math.abs(o.at - h.at) <= MENU_SPAN).map((o) => o.name));
      h.nav = ranges.some(([s, e]) => h.at >= s && h.at < e) || near.size >= MENU_COUNT;
    }
    for (const to of names) {
      if (to === from) continue;
      const mine = hits.filter((h) => h.name === to);
      if (mine.length) edges.push({ from, to, nav: mine.every((h) => h.nav) });
    }
  }
  return edges;
}
