/**
 * Help → User Guide…: the chapters of docs/user in a window of its own over the app. On the left the search field and either the
 * contents (chapters, the sections of the open one) or the results of a search; on the right the chapter. Links between the
 * chapters open there, ← goes back, the words searched for are marked in the text. Esc or the cross closes it.
 * `api` = window.studio (helpDocs, openExternal).
 */
import { closeButton } from "./dialogChrome.js";
import { markdownDoc } from "./markdown.js";
import { parseChapters, searchDocs, queryWords, headingSlug } from "./helpDocs.js";

const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });

export function createHelpDialog({ api }) {
  const box = el("div"); box.id = "helpbox"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="hp-title">
    <div class="dlg-head"><button class="hp-back icon" type="button" title="Back" aria-label="Back" disabled>←</button><h2 id="hp-title">User Guide</h2></div>
    <div class="hp-main">
      <nav class="hp-side" aria-label="Contents">
        <input class="hp-q" type="search" placeholder="Search the guide" aria-label="Search the guide" spellcheck="false">
        <div class="hp-list" role="list"></div>
      </nav>
      <article class="hp-doc" tabindex="-1"></article>
    </div></div>`;
  document.body.append(box);
  const card = box.firstElementChild, q = box.querySelector(".hp-q"), list = box.querySelector(".hp-list"), doc = box.querySelector(".hp-doc"), back = box.querySelector(".hp-back");
  card.querySelector(".dlg-head").append(closeButton(() => close()));

  let chapters = null, current = null, history = [], marks = [];

  const close = () => { box.hidden = true; };
  const chapterOf = (file) => chapters?.find((c) => c.file === file) ?? null;

  /** The contents: every chapter; under the open one its sections (## only, ### would make it long). */
  function paintContents() {
    list.replaceChildren(...chapters.flatMap((c) => {
      const b = el("button", `hp-ch${c.file === current?.file ? " on" : ""}`, c.title); b.type = "button"; b.setAttribute("role", "listitem");
      b.onclick = () => show(c.file);
      if (c.file !== current?.file) return [b];
      const subs = c.sections.filter((s) => s.level === 2).map((s) => { const x = el("button", "hp-sec", s.title); x.type = "button"; x.onclick = () => show(c.file, s.id); return x; });
      return [b, ...subs];
    }));
  }

  /** The results of a search; none: a line that says so. */
  function paintResults(text) {
    const found = searchDocs(chapters, text);
    if (!found.length) { list.replaceChildren(el("p", "hp-none mute", queryWords(text).length ? "Nothing found. Try other words." : "Type at least two letters.")); return; }
    list.replaceChildren(el("p", "hp-count mute", `${found.length === 40 ? "40+" : found.length} result${found.length === 1 ? "" : "s"}`), ...found.map((r) => {
      const b = el("button", "hp-res"); b.type = "button"; b.setAttribute("role", "listitem");
      b.append(el("b", "", r.title), el("small", "mute", r.chapter), el("span", "", r.snippet));
      b.onclick = () => show(r.file, r.id, { mark: text });
      return b;
    }));
  }

  /** Marks the words of a search in the text of the chapter (the first one is scrolled to when there is no heading to go to). */
  function markWords(text) {
    for (const m of marks) m.replaceWith(...m.childNodes); marks = []; doc.normalize();
    const words = queryWords(text); if (!words.length) return;
    const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const s = n.nodeValue; re.lastIndex = 0; if (!re.test(s)) continue;
      const frag = document.createDocumentFragment(); let last = 0; re.lastIndex = 0;
      for (let m; (m = re.exec(s));) { frag.append(s.slice(last, m.index)); const mk = el("mark", "", m[0]); marks.push(mk); frag.append(mk); last = m.index + m[0].length; }
      frag.append(s.slice(last)); n.replaceWith(frag);
    }
  }

  /** Opens a chapter (and scrolls to a heading). `push: false` when going back. */
  function show(file, anchor = "", { mark = "", push = true } = {}) {
    const c = chapterOf(file) ?? chapters[0]; if (!c) return;
    if (push && current) history.push({ file: current.file, top: doc.scrollTop });
    back.disabled = !history.length;
    if (c !== current) {
      current = c;
      doc.innerHTML = markdownDoc(c.text, { docLinks: true });
      const seen = new Map(); // the ids of the headings, as the links between the chapters expect them
      for (const h of doc.querySelectorAll("h1, h2, h3, h4")) { const base = headingSlug(h.textContent), n = seen.get(base) ?? 0; seen.set(base, n + 1); h.id = `hp-${n ? `${base}-${n}` : base}`; }
    }
    markWords(mark);
    if (!q.value.trim()) paintContents();
    const target = anchor ? doc.querySelector(`#hp-${CSS.escape(anchor)}`) : null;
    if (target) target.scrollIntoView({ block: "start" }); else if (mark && marks[0]) marks[0].scrollIntoView({ block: "center" }); else doc.scrollTop = 0;
  }

  doc.addEventListener("click", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    e.preventDefault();
    if (a.dataset.href) api.openExternal(a.dataset.href);
    else if ("doc" in a.dataset) show(a.dataset.doc || current.file, a.dataset.anchor);
  });
  back.onclick = () => { const h = history.pop(); if (!h) return; show(h.file, "", { push: false }); doc.scrollTop = h.top; back.disabled = !history.length; };
  let timer = 0;
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => (q.value.trim() ? paintResults(q.value) : (markWords(""), paintContents())), 120); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); list.querySelector(".hp-res")?.click(); }
    else if (e.key === "Escape" && q.value) { e.preventDefault(); e.stopPropagation(); q.value = ""; markWords(""); paintContents(); }
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") { e.preventDefault(); q.focus(); q.select(); }
  });
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });

  /** Opens the guide: at a chapter (file name) and heading, or where it was left; `search` puts words into the search field. */
  async function open({ file = null, anchor = "", search = "" } = {}) {
    if (!chapters) {
      const files = await api.helpDocs().catch((e) => ({ error: String(e?.message ?? e) }));
      if (files?.error || !files?.length) { box.hidden = false; list.replaceChildren(); doc.replaceChildren(el("p", "err", `The user guide could not be read${files?.error ? `: ${files.error}` : "."}`)); return; }
      chapters = parseChapters(files);
    }
    box.hidden = false;
    q.value = search;
    if (file || !current) show(file ?? chapters[0].file, anchor, { push: false });
    if (search) paintResults(search); else paintContents();
    q.focus();
  }
  return { open, close, isOpen: () => !box.hidden };
}
