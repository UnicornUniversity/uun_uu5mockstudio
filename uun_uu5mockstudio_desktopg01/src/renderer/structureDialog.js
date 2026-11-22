import { normalizeTree, countNodes, moveTo, getNode, componentView, realStructure, changesOnly } from "./planTree.js";
import { renderDiagram } from "./planDiagram.js";

const $ = (id) => document.getElementById(id);

/**
 * The structure (decomposition) of a screen, read from its file: a read-only diagram of the components in the order of rendering.
 * A click on a box that stands for a JSX element shows it in the inspector.
 * The boxes can be dragged (before / after / inside another one); **Regenerate the screen** then sends the original and the rearranged structure to the agent, which rebuilds the screen.
 * `api`: structure(file) -> tree | null | { error }, show(file, ordinal) (the inspector), plan(file) (a change of this screen in Plan mode), regenerate(file, original, tree, ops).
 */
export function createStructureDialog({ api }) {
  const box = $("structbox"), body = $("st-body"), title = $("st-title"), note = $("st-note");
  let file = null, entry = null, chosen = null, original = null, ops = [], whole = null, full = null, focus = [], base = null, view = "mockup"; // base: the baseline (the component read from the code); view: "real" | "mockup" // full: the structure as read; focus: the component the screen is about // whole: the component the structure is of (null: the whole screen) // ops: the moves made, as the file understands them
  const close = () => { box.hidden = true; file = null; entry = null; chosen = null; original = null; ops = []; whole = null; };
  const pick = $("st-pick");
  /** The strip under the diagram: what was clicked, and the way to the inspector (the dialog closes; the inspector has a way back). */
  function bar() {
    pick.replaceChildren();
    if (!chosen) return void (pick.hidden = true);
    pick.hidden = false;
    const label = Object.assign(document.createElement("span"), { className: "grow", textContent: chosen.name + (chosen.note ? ` · ${chosen.note}` : "") });
    const go = Object.assign(document.createElement("button"), { type: "button", textContent: "Show in the inspector", disabled: !Number.isInteger(chosen.ordinal), title: Number.isInteger(chosen.ordinal) ? "" : "This node is not a component written in the file", onclick: () => { const f = file, o = chosen.ordinal, part = whole; close(); api.show(f, o, part); } });
    pick.append(label, go);
  }

  const changes = () => (original && entry && JSON.stringify(original) !== JSON.stringify(entry.tree) ? Math.max(1, ops.length) : 0); // also two components of the same name that swapped places
  const buttons = () => { const n = changes(); $("st-regen").disabled = !n; $("st-reset").disabled = !n; $("st-regen").textContent = n ? `Regenerate the screen (${n} change${n === 1 ? "" : "s"})` : "Regenerate the screen"; };
  /** Drag and drop (and the keyboard): the node `from` goes before / after / inside the node `to`; the move is logged for the file. */
  const move = (from, to, pos) => {
    const n = getNode(entry.tree, from), t = getNode(entry.tree, to), r = moveTo(entry.tree, from, to, pos);
    if (r.tree === entry.tree) return;
    ops.push({ ordinal: n?.ordinal ?? null, target: t?.ordinal ?? null, position: pos, name: n?.name, targetName: t?.name });
    entry.tree = r.tree; entry.sel = r.path; entry.collapsed = []; chosen = null; bar(); paint();
  };
  function paint() {
    buttons();
    body.replaceChildren(renderDiagram({
      entry, editable: true, checkNames: false,
      onMove: (...a) => { if (view === "mockup") move(...a); }, // the real structure is read from the code: it is changed through the screen or a plan, not by dragging
      onKey: (path, e) => {
        if (!e.altKey || !path.length) return;
        const i = path.at(-1), up = path.slice(0, -1);
        const m = { ArrowUp: i > 0 && [[...up, i - 1], "before"], ArrowDown: [[...up, i + 1], "after"], ArrowRight: i > 0 && [[...up, i - 1], "inside"], ArrowLeft: path.length > 1 && [up, "after"] }[e.key];
        if (m && getNode(entry.tree, m[0])) { e.preventDefault(); move(path, m[0], m[1]); }
      },
      onSelect: () => {},
      onDetail: () => {},
      onNodeClick: (node, path) => { entry.sel = path; chosen = node; paint(); bar(); },
    }));
  }

  $("st-x").onclick = close;
  /**
   * What the dialog shows: the real structure (a screen made from an existing component: the code's tree with the screen's new parts, the
   * non-visual parts included) or the mockup's structure (without its helpers unless asked; this one can be rearranged).
   */
  function show() {
    const real = view === "real" && base;
    const screenTree = componentView(full, { focus, helpers: !real && $("st-helpers").checked });
    const whole = real ? realStructure(base.tree, componentView(full, { focus })) : screenTree;
    const onlyChanges = real && $("st-changes").checked, tree = onlyChanges ? changesOnly(whole) ?? { ...whole, children: [] } : whole; // the real structure narrowed to what changes and the way to it
    original = JSON.parse(JSON.stringify(tree)); entry = { tree, sel: [], collapsed: [], view: null }; ops = []; chosen = null; bar();
    let added = 0; const w = (n) => { if (n.change === "add") added++; (n.children ?? []).forEach(w); }; w(tree);
    note.textContent = real ? (onlyChanges ? `${added} new, shown with the way to them (${countNodes(whole)} components in all)` : `${countNodes(tree)} components from the code${added ? `, ${added} new` : ""}`) : `${countNodes(tree)} components${countNodes(tree) < countNodes(full) ? ` (${countNodes(full) - countNodes(tree)} mockup helpers hidden)` : ""}`;
    note.title = real ? `${base.name} as it is in ${base.file}, with what the screen adds; dashed = not visual (logic, providers, data loading)` : "In the order of rendering, top-down and left to right";
    $("st-view").hidden = !base; for (const b of $("st-view").children) b.classList.toggle("on", b.dataset.view === view);
    $("st-helpers").parentElement.hidden = Boolean(real); $("st-changes").parentElement.hidden = !real; $("st-reset").hidden = Boolean(real); $("st-regen").hidden = Boolean(real); $("st-reread").hidden = !real; $("st-update").hidden = !real || Boolean(whole) || !api.update;
    $("st-hint").title = real ? "The structure of the component as it is in the code, with the new parts of the screen in their place (new). It is not rearranged here: change the screen, or plan a change." : "Click a component to select it. Drag a box onto another to rearrange: left third = before, right third = after, middle = inside. Drag the background to move, Ctrl/⌘ + wheel to zoom.";
    paint();
  }
  for (const b of $("st-view").children) b.onclick = () => { view = b.dataset.view; show(); };
  // the mockup's helpers (page shell, demo switches, fake data): hidden by default, the tree is the component itself
  $("st-helpers").onchange = () => { if (full) show(); };
  $("st-changes").onchange = () => { if (full) { show(); setTimeout(() => [...body.querySelectorAll(".pd-bar button")].find((b) => b.textContent === "Fit")?.click(), 60); } }; // narrowed: fit it in the view
  $("st-reread").onclick = async () => { // the code is read again (it changed, or it was read before the reading got better)
    const b = $("st-reread"); b.disabled = true; b.textContent = "Reading…";
    const r = await api.reread?.(file).catch((e) => ({ error: String(e?.message ?? e) }));
    b.disabled = false; b.textContent = "Re-read the code";
    if (!r || r.error) { note.textContent = r?.error ?? "The code could not be read."; return; }
    base = { ...base, tree: normalizeTree(r.tree) }; show(); api.toast?.(`${r.name} was read again from ${r.file}: ${r.nodes} components from ${r.files} file${r.files === 1 ? "" : "s"}.`);
  };
  $("st-update").onclick = () => { const f = file; close(); if (f) api.update(f); };
  $("st-reset").onclick = () => { if (!original) return; entry.tree = JSON.parse(JSON.stringify(original)); ops = []; entry.sel = []; entry.collapsed = []; chosen = null; bar(); paint(); };
  $("st-regen").onclick = () => { const f = file, o = original, t = entry?.tree, made = ops.slice(), part = whole; if (!f || !o || !t || !changes()) return; close(); api.regenerate(f, o, t, made, part); };
  $("st-plan").onclick = () => { const f = file; close(); if (f) api.plan(f); };
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    async open(f, part = null) {
      file = f; entry = null; chosen = null; ops = []; bar(); title.textContent = part ? `Component tree of ${String(part.name ?? "the component").replace(/^(Uu5|Plus4U5)[A-Za-z0-9]*\./, "")} in ${f.replace(/\.html$/, "")}` : `Component tree of ${f.replace(/\.html$/, "")}`; whole = part; body.replaceChildren(); note.textContent = "Reading the file…"; $("st-legend").hidden = true;
      box.hidden = false;
      const r = await api.structure(f, part?.ordinal ?? null).catch((e) => ({ error: String(e?.message ?? e) }));
      full = r && !r.error ? normalizeTree(r) : null;
      focus = part ? [] : await (api.focus?.(f) ?? Promise.resolve([])).catch(() => []); // a screen made from an existing component starts at that component
      if (!full) { note.textContent = r?.error ?? (part ? "This element has no structure of its own (it is an HTML element or it is not written in the file)." : "The screen has no components to show."); $("st-view").hidden = true; return; }
      const b = !part && focus.length ? await (api.baseline?.(f) ?? Promise.resolve(null)).catch(() => null) : null; // a screen made from an existing component: its real structure first
      base = b && !b.error && b.tree ? { ...b, tree: normalizeTree(b.tree) } : null; view = base ? "real" : "mockup";
      $("st-legend").hidden = false;
      show();
    },
    close, isOpen: () => !box.hidden,
  };
}
