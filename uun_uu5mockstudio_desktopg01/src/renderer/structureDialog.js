import { normalizeTree, countNodes } from "./planTree.js";
import { renderDiagram } from "./planDiagram.js";

const $ = (id) => document.getElementById(id);

/**
 * The structure (decomposition) of a screen, read from its file: a read-only diagram of the components in the order of rendering.
 * A click on a box that stands for a JSX element shows it in the inspector.
 * `api`: structure(file) -> tree | null | { error }, show(file, ordinal) (the inspector), plan(file) (a change of this screen in Plan mode).
 */
export function createStructureDialog({ api }) {
  const box = $("structbox"), body = $("st-body"), title = $("st-title"), note = $("st-note");
  let file = null, entry = null, chosen = null;
  const close = () => { box.hidden = true; file = null; entry = null; chosen = null; };
  const pick = $("st-pick");
  /** The strip under the diagram: what was clicked, and the way to the inspector (the dialog closes; the inspector has a way back). */
  function bar() {
    pick.replaceChildren();
    if (!chosen) return void (pick.hidden = true);
    pick.hidden = false;
    const label = Object.assign(document.createElement("span"), { className: "grow", textContent: chosen.name + (chosen.note ? ` · ${chosen.note}` : "") });
    const go = Object.assign(document.createElement("button"), { type: "button", textContent: "Show in the inspector", disabled: !Number.isInteger(chosen.ordinal), title: Number.isInteger(chosen.ordinal) ? "" : "This node is not a component written in the file", onclick: () => { const f = file, o = chosen.ordinal; close(); api.show(f, o); } });
    pick.append(label, go);
  }

  function paint() {
    body.replaceChildren(renderDiagram({
      entry, editable: false, checkNames: false,
      onCollapse: (key) => { const c = new Set(entry.collapsed ?? []); if (!c.delete(key)) c.add(key); entry.collapsed = [...c]; paint(); },
      onSelect: () => {},
      onDetail: () => {},
      onNodeClick: (node, path) => { entry.sel = path; chosen = node; paint(); bar(); },
    }));
  }

  $("st-x").onclick = close;
  $("st-plan").onclick = () => { const f = file; close(); if (f) api.plan(f); };
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    async open(f) {
      file = f; entry = null; chosen = null; bar(); title.textContent = `Structure of ${f.replace(/\.html$/, "")}`; body.replaceChildren(); note.textContent = "Reading the file…";
      box.hidden = false;
      const r = await api.structure(f).catch((e) => ({ error: String(e?.message ?? e) }));
      const tree = r && !r.error ? normalizeTree(r) : null;
      if (!tree) { note.textContent = r?.error ?? "The screen has no components to show."; return; }
      entry = { tree, sel: [], collapsed: [], view: null };
      note.textContent = `${countNodes(tree)} components, in the order of rendering. ×N = once per item, R = rendered when, D = disabled when. Click a component to show it in the inspector.`;
      paint();
    },
    close, isOpen: () => !box.hidden,
  };
}
