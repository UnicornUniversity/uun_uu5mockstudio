const $ = (id) => document.getElementById(id);

/**
 * "Components from the libraries": a dialog to find a component of Uu5Elements, Uu5Forms, Plus4U5Elements, … in the documentation of the
 * uu5-development plugin and add it to the message as @Name. Click selects one, Shift / Cmd / Ctrl + click several, a double click adds at once.
 * `api` = window.studio (docsSearch, docsLibraries, docsDescribe). Resolves the names of the chosen components or null.
 */
export function createLibraryPicker({ api, onAdd }) {
  const box = $("libbox"), list = $("lb-list"), detail = $("lb-detail"), search = $("lb-search"), lib = $("lb-lib"), note = $("lb-note"), add = $("lb-add");
  const view = $("libview"), card = view.parentElement;
  let inline = false, inlineHost = null, backTo = null, resolve = null, chosen = new Set(), last = null, results = [], seq = 0, libsLoaded = false;

  function done(value) { if (inline) { if (value?.length) onAdd?.(value); chosen = new Set(); paint(); return; } box.hidden = true; const r = resolve; resolve = null; r?.(value); if (backTo) { const h = backTo; backTo = null; this_.showInline(h); } }
  const refreshButtons = () => { add.disabled = !chosen.size; add.textContent = chosen.size > 1 ? `Add ${chosen.size} to message` : "Add to message"; };

  const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });
  /** Text with `code` spans from the documentation as nodes (no HTML is ever interpreted). */
  const rich = (tag, cls, text) => { const n = el(tag, cls); String(text).split("`").forEach((part, i) => { if (!part) return; n.append(i % 2 ? el("code", "ic", part) : part); }); return n; };
  /** The documentation of one component: name, library, description, then a table of its props (type or allowed values, default, what it does). */
  async function showDetail(name) {
    last = name; detail.replaceChildren(el("p", "mute", "…"));
    const d = await api.docsDetail(name).catch(() => null);
    if (last !== name) return;
    if (!d) return void detail.replaceChildren(el("p", "mute", "No description."));
    const head = el("div", "ld-head");
    head.append(el("h3", "", d.name), el("span", "ld-lib", d.library));
    const open = () => api.docsOpen(d.url);
    const docsLink = () => { const a = el("a", "ld-link", "Open the documentation ↗"); a.href = "#"; a.title = d.url; a.onclick = (e) => { e.preventDefault(); open(); }; return a; };
    if (d.url) head.append(docsLink());
    const nodes = [head, rich("p", "ld-desc", d.description || "No description.")];
    const use = el("div", "ld-use"); use.append("In a message: ", el("code", "", `@${d.name}`));
    nodes.push(use);
    if (d.props.length) {
      const table = el("table", "ld-props"), tbody = document.createElement("tbody");
      table.createTHead().innerHTML = "<tr><th>Prop</th><th>Type</th><th>Default</th></tr>";
      for (const p of d.props) {
        const tr = document.createElement("tr"), n = el("td", "pn"), t = el("td", "pt"), df = el("td", "pdef", p.default ?? "");
        // a long default (an object, a function, several lines) is one clipped line; a click shows all of it, another click clips it again
        if (String(p.default ?? "").length > 28 || /\n/.test(String(p.default ?? ""))) { df.classList.add("long"); df.title = "Click to show or hide all of it"; df.tabIndex = 0; df.onclick = () => df.classList.toggle("open"); df.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); df.classList.toggle("open"); } }; }
        n.append(el("code", "", p.name)); if (p.required) n.append(el("span", "req", "required"));
        if (p.enum) for (const v of p.enum) t.append(el("span", "pv", v)); else t.append(el("span", "ptype", p.type));
        tr.append(n, t, df); tbody.append(tr);
        if (p.description) { const row = document.createElement("tr"), c = rich("td", "pdesc", p.description); c.colSpan = 3; row.className = "ld-desc-row"; row.append(c); tbody.append(row); }
      }
      table.append(tbody); nodes.push(el("h4", "", `Props (${d.props.length})`), table);
    } else nodes.push(el("p", "mute", "The documentation lists no props for this one."));
    detail.replaceChildren(...nodes); detail.scrollTop = 0;
  }
  function paint() {
    list.replaceChildren(...results.map((c) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "lb-item" + (chosen.has(c.name) ? " on" : ""); b.dataset.name = c.name;
      b.append(Object.assign(document.createElement("b"), { textContent: c.name }), Object.assign(document.createElement("span"), { textContent: c.description || c.library }));
      b.onclick = (e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) { if (chosen.has(c.name)) chosen.delete(c.name); else chosen.add(c.name); } else { chosen = new Set([c.name]); }
        paint(); refreshButtons(); showDetail(c.name);
      };
      b.ondblclick = () => done([c.name]);
      return b;
    }));
    refreshButtons();
  }
  async function run() {
    const my = ++seq, r = await api.docsSearch(search.value, lib.value).catch(() => null);
    if (my !== seq) return;
    if (!r?.available) { results = []; list.replaceChildren(); detail.textContent = ""; note.textContent = "The plugin uu5-development is not installed, so there is no documentation of the library components to browse. Install it in Help > Claude Code & Plugins…"; return; }
    results = r.results;
    note.textContent = results.length >= 60 ? "Showing the first 60: narrow the search." : `${results.length} component${results.length === 1 ? "" : "s"}`;
    paint();
    if (!results.length) detail.textContent = "";
  }
  async function loadLibraries() {
    if (libsLoaded) return;
    const r = await api.docsLibraries().catch(() => null); if (!r?.available) return;
    libsLoaded = true;
    lib.replaceChildren(new Option("All libraries", ""), ...r.libraries.map((l) => new Option(`${l.library} (${l.count})`, l.library)));
  }
  search.oninput = run; lib.onchange = run;
  add.onclick = () => done([...chosen]);
  $("lb-x").onclick = () => done(null);
  view.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (!inline) { e.stopPropagation(); done(null); } }
    else if (e.key === "Enter" && chosen.size && e.target !== lib) { e.preventDefault(); done([...chosen]); }
  });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape" && !inline) { e.stopPropagation(); done(null); } });
  box.addEventListener("mousedown", (e) => { if (e.target === box) done(null); });

  const this_ = {
    /** The same browser as a tab of the side panel: `host` takes the view over from the dialog; "Add to message" calls `onAdd(names)`. */
    async showInline(host) {
      inline = true; inlineHost = host; host.append(view); chosen = new Set(); refreshButtons();
      await loadLibraries(); await run();
    },
    /** Back to the dialog (the view is put into its card again). */
    leaveInline() { if (!inline) return; inline = false; inlineHost = null; card.append(view); },
    focusSearch() { search.focus(); },
    async open(query = "") {
      if (inline) { backTo = inlineHost; this.leaveInline(); } // the dialog borrows the view; the side panel gets it back
      chosen = new Set(); last = null; detail.textContent = ""; search.value = query;
      box.hidden = false; refreshButtons(); search.focus();
      await loadLibraries(); await run();
      return new Promise((r) => { resolve = r; });
    },
  };
  return this_;
}
