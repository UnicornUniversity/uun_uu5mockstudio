/**
 * A file of the linked repository, picked from a searchable list under a field (the handoff's "existing component"): the source files of
 * the repository (git ls-files, secrets left out: main repo:files), filtered by every word typed, code files first, tests last.
 * `search(query)` → paths; `onPick(path)`. Esc or a click elsewhere closes it. Returns { close }.
 */
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n; };
const CODE = /\.(jsx?|tsx?|mjs|cjs)$/i, TEST = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\./i;

/** The words to start the search with from a component name: "CourseOverview" → "course overview". */
export const wordsOf = (name) => String(name ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9]+/g, " ").trim().toLowerCase();

/** Code files first, then the rest; tests at the end; the order of the search kept within each group. */
export function rankFiles(files) {
  const g = (f) => (TEST.test(f) ? 2 : CODE.test(f) ? 0 : 1);
  return files.map((f, i) => [f, i]).sort((a, b) => g(a[0]) - g(b[0]) || a[1] - b[1]).map(([f]) => f);
}

export function openRepoFilePicker({ anchor, host = document.body, search, initial = "", suggest = [], onPick }) {
  const input = h("input", { type: "search", value: initial, placeholder: "Search the files of the repository (words of the path)…", spellcheck: false, "aria-label": "Search the files of the repository" });
  const list = h("div", { className: "rfp-list", role: "listbox" });
  const info = h("div", { className: "rfp-info mute" });
  const box = h("div", { className: "rfp", role: "dialog", "aria-label": "Pick a file of the repository" }, input, list, info);
  let items = [], idx = 0, seq = 0;
  const place = () => {
    const r = anchor.getBoundingClientRect(), below = innerHeight - r.bottom - 12, h0 = Math.min(360, Math.max(200, below));
    box.style.left = `${Math.max(8, r.left)}px`; box.style.width = `${Math.min(r.width, innerWidth - 16)}px`;
    if (below >= 200) { box.style.top = `${r.bottom + 4}px`; box.style.bottom = ""; } else { box.style.top = ""; box.style.bottom = `${innerHeight - r.top + 4}px`; }
    list.style.maxHeight = `${h0 - 80}px`;
  };
  const paint = () => {
    list.replaceChildren(...items.map((f, i) => {
      const cut = f.lastIndexOf("/"), row = h("button", { type: "button", className: `rfp-row${i === idx ? " on" : ""}${TEST.test(f) ? " test" : ""}`, role: "option", title: f },
        h("b", { textContent: f.slice(cut + 1) }), cut > 0 ? h("span", { className: "mute", textContent: ` ${f.slice(0, cut)}` }) : null, suggest.includes(f) ? h("i", { className: "rfp-sug", textContent: "by name" }) : null);
      row.setAttribute("aria-selected", String(i === idx));
      row.onmousedown = (e) => e.preventDefault(); // keep the focus in the search
      row.onclick = () => pick(f);
      return row;
    }));
    list.children[idx]?.scrollIntoView({ block: "nearest" });
    info.textContent = items.length ? `${items.length === 60 ? "First 60" : items.length} file${items.length === 1 ? "" : "s"} · ↑↓ and Enter to choose, Esc to close` : "No file matches: try fewer or other words.";
  };
  const run = async () => {
    const my = ++seq, q = input.value.trim();
    const found = await search(q).catch(() => []);
    if (my !== seq) return;
    items = rankFiles([...new Set([...(q ? [] : suggest), ...found])]).slice(0, 60); idx = 0; paint();
  };
  let t = null;
  input.oninput = () => { clearTimeout(t); t = setTimeout(run, 120); };
  input.onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (items.length) { idx = (idx + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; paint(); } }
    else if (e.key === "Enter") { e.preventDefault(); if (items[idx]) pick(items[idx]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); }
  };
  const outside = (e) => { if (!box.contains(e.target) && e.target !== anchor) close(); };
  function close() { box.remove(); document.removeEventListener("mousedown", outside, true); removeEventListener("resize", place); }
  function pick(f) { close(); onPick(f); }
  host.append(box); place(); input.focus(); input.select(); run();
  document.addEventListener("mousedown", outside, true); addEventListener("resize", place);
  return { close };
}
