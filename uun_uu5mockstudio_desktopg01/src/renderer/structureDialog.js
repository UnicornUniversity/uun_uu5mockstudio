import { normalizeTree, countNodes, moveTo, getNode } from "./planTree.js";
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
  let file = null, entry = null, chosen = null, original = null, ops = [], whole = null; // whole: the component the structure is of (null: the whole screen) // ops: the moves made, as the file understands them
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
      onMove: move,
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
  $("st-reset").onclick = () => { if (!original) return; entry.tree = JSON.parse(JSON.stringify(original)); ops = []; entry.sel = []; entry.collapsed = []; chosen = null; bar(); paint(); };
  $("st-regen").onclick = () => { const f = file, o = original, t = entry?.tree, made = ops.slice(), part = whole; if (!f || !o || !t || !changes()) return; close(); api.regenerate(f, o, t, made, part); };
  $("st-plan").onclick = () => { const f = file; close(); if (f) api.plan(f); };
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    async open(f, part = null) {
      file = f; entry = null; chosen = null; ops = []; bar(); title.textContent = part ? `Component tree of ${String(part.name ?? "the component").replace(/^(Uu5|Plus4U5)[A-Za-z0-9]*\./, "")} in ${f.replace(/\.html$/, "")}` : `Component tree of ${f.replace(/\.html$/, "")}`; whole = part; body.replaceChildren(); note.textContent = "Reading the file…";
      box.hidden = false;
      const r = await api.structure(f, part?.ordinal ?? null).catch((e) => ({ error: String(e?.message ?? e) }));
      const tree = r && !r.error ? normalizeTree(r) : null;
      if (!tree) { note.textContent = r?.error ?? (part ? "This element has no structure of its own (it is an HTML element or it is not written in the file)." : "The screen has no components to show."); return; }
      original = JSON.parse(JSON.stringify(tree)); entry = { tree, sel: [], collapsed: [], view: null };
      note.textContent = `${countNodes(tree)} components, in the order of rendering. ×N = once per item, R = rendered when, D = disabled when. Click a component to select it, drag it to rearrange.`;
      paint();
    },
    close, isOpen: () => !box.hidden,
  };
}
