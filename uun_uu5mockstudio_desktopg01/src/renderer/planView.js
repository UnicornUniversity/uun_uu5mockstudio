import { KINDS, CHANGES, getNode, updateNode, addChild, addSibling, removeNode, duplicateNode, moveNode, indentNode, outdentNode, moveTo, countNodes } from "./planTree.js";
import { markdown } from "./markdown.js";
import { renderDiagram } from "./planDiagram.js";
import { isAnswered, unanswered } from "./planTree.js";

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k.startsWith("aria-")) n.setAttribute(k, v); else n[k] = v; } // aria-* are attributes, not properties
  n.append(...kids.filter((x) => x != null));
  return n;
};
const pathKey = (p) => p.join(".");
const KIND_LABEL = { screen: "screen", new: "new", library: "library", existing: "existing" };

/**
 * A plan in the chat: the text, the tree of components, and what can be done with it (edit it, build it, revise it, discard it).
 * `entry` = { text, tree, original: { text, tree }, state: "proposed" | "approved" | "discarded", editing, sel, known: [names of library components that exist] }.
 * `ctx` = { change(entry) (repaint and save), build(entry), revise(entry), discard(entry), chooseComponent(): Promise<string|null>, checkNames(entry), showDetail(name, host) }.
 */
export function renderPlan(entry, ctx) {
  const root = el("div", { className: `msg plan ${entry.state ?? "proposed"}` });
  const editable = entry.state === "proposed" && entry.editing;
  const known = new Set(entry.known ?? []);
  entry.sel ??= [];
  const drag = { from: null };

  const touch = (tree, sel) => { entry.tree = tree; entry.collapsed = []; if (sel) entry.sel = sel; ctx.checkNames?.(entry); ctx.change(entry); };

  // ----- header
  const stateText = entry.state === "superseded" ? "replaced by a newer plan" : entry.state === "approved" ? "approved, building" : entry.state === "discarded" ? "discarded" : entry.editing ? "editing" : "proposed";
  root.append(el("div", { className: "plan-head" }, el("b", { textContent: "Plan" }), el("span", { className: "plan-state", textContent: stateText }), entry.tree ? el("span", { className: "plan-count mute", textContent: `${countNodes(entry.tree)} components` }) : null));

  if (entry.state === "superseded") return root;
  // ----- text
  if (editable) {
    const ta = el("textarea", { className: "plan-edit", value: entry.text, spellcheck: false, rows: 8, "aria-label": "Text of the plan" });
    ta.oninput = () => { entry.text = ta.value; ctx.persist?.(entry); };
    root.append(ta);
  } else if (entry.text) root.append(el("div", { className: "plan-text", innerHTML: markdown(entry.text) }));

  // ----- questions of the agent
  if (entry.questions?.length) root.append(questionsView());
  function questionsView() {
    const open = entry.state === "proposed", answers = (entry.answers ??= {});
    const box = el("div", { className: "plan-qs" });
    const left = unanswered(entry.questions, answers).length;
    box.append(el("div", { className: "plan-qhead" }, el("b", { textContent: "Questions" }), el("span", { className: "mute", textContent: `${entry.questions.length - left} of ${entry.questions.length} answered` })));
    for (const q of entry.questions) {
      const a = (answers[q.id] ??= { choices: [] }), card = el("fieldset", { className: "plan-q", disabled: !open });
      card.append(el("legend", {}, q.header ? el("span", { className: "qh", textContent: q.header }) : null, el("span", { textContent: q.question })));
      const opts = el("div", { className: "plan-opts", role: q.multiSelect ? "group" : "radiogroup", "aria-label": q.question });
      for (const o of q.options) {
        const on = a.choices.includes(o.label);
        const b = el("button", { type: "button", className: `plan-opt${on ? " on" : ""}`, role: q.multiSelect ? "checkbox" : "radio", "aria-checked": String(on) },
          el("span", { className: "ob", "aria-hidden": "true", textContent: on ? "✓" : "" }), el("span", { className: "ot" }, el("b", { textContent: o.label }), o.description ? el("small", { textContent: o.description }) : null));
        b.onclick = () => {
          a.choices = q.multiSelect ? (on ? a.choices.filter((x) => x !== o.label) : [...a.choices, o.label]) : (on ? [] : [o.label]);
          if (!q.multiSelect && a.choices.length) a.other = "";
          ctx.change(entry);
        };
        opts.append(b);
      }
      const other = el("input", { type: "text", className: "plan-other", value: a.other ?? "", placeholder: "Other…", spellcheck: false, "aria-label": `Other answer: ${q.question}` });
      other.oninput = () => { a.other = other.value; if (!q.multiSelect && other.value.trim()) a.choices = []; ctx.persist?.(entry); };
      other.onchange = () => ctx.change(entry);
      card.append(opts, other); box.append(card);
    }
    return box;
  }

  // ----- tree: a diagram (default) or an outline
  entry.mode ??= "diagram";
  const movable = entry.state === "proposed"; // the boxes of a plan that waits for approval can be dragged at once, without "Edit plan"
  const pickDetail = (name) => ctx.showDetail?.(name, detailHost);
  const detailHost = el("div", { className: "pd-detail" });
  const treeHost = el("div", { className: `pd-wrap${entry.full ? " full" : ""}` });
  if (entry.tree) {
    const switcher = el("div", { className: "rc-scope plan-view", role: "radiogroup", "aria-label": "How the tree is shown" },
      ...[["diagram", "Diagram"], ["outline", "Outline"]].map(([m, label]) => el("button", { type: "button", textContent: label, className: entry.mode === m ? "on" : "", role: "radio", "aria-checked": String(entry.mode === m), onclick: () => { entry.mode = m; ctx.change(entry); } })));
    if (entry.mode === "diagram") {
      const toggleFull = () => { entry.full = !entry.full; ctx.change(entry); };
      const diagram = renderDiagram({
        entry, editable: movable, known, fullscreen: entry.full, onFullscreen: toggleFull,
        onSelect: (path) => {
          if (!editable) { const n = getNode(entry.tree, path); if (n?.kind === "library" && known.has(n.name)) pickDetail(n.name); return; } // not editing: a click shows what the component is
          entry.sel = path; ctx.change(entry);
        },
        onMove: (from, to, pos) => { const r = moveTo(entry.tree, from, to, pos); if (r.tree !== entry.tree) touch(r.tree, r.path); },
        onCollapse: (key) => { const c = new Set(entry.collapsed ?? []); if (!c.delete(key)) c.add(key); entry.collapsed = [...c]; ctx.change(entry); },
        onDetail: pickDetail,
        onKey: (path, e) => {
          if (e.key === "Delete" || e.key === "Backspace") { if (path.length && editable) { e.preventDefault(); touch(removeNode(entry.tree, path), path.slice(0, -1)); } return; }
          if (!e.altKey) return;
          const f = { ArrowLeft: () => outdentNode(entry.tree, path), ArrowRight: () => indentNode(entry.tree, path), ArrowUp: () => moveNode(entry.tree, path, -1), ArrowDown: () => moveNode(entry.tree, path, 1) }[e.key];
          if (f) { e.preventDefault(); const r = f(); if (r.tree !== entry.tree) touch(r.tree, r.path); }
        },
      });
      treeHost.append(el("div", { className: "pd-top" }, switcher, entry.full ? el("button", { type: "button", className: "dlg-x", textContent: "✕", title: "Close the large view", "aria-label": "Close the large view", onclick: () => { entry.full = false; ctx.change(entry); } }) : null), diagram);
      if (movable) treeHost.append(el("p", { className: "mute pd-hint", textContent: "Drag a box onto another: left edge = before, right edge = after, middle = inside. Ctrl/⌘ + wheel zooms, drag the background to move." }));
      treeHost.append(detailHost);
      if (editable && entry.full) { const side = el("div", { className: "pd-side" }); side.append(nodeEditor()); treeHost.append(side); }
      root.append(treeHost);
    } else {
      root.append(switcher, outline());
    }
  }
  function outline() {
    const node = (n, path) => {
      const k = pathKey(path), sel = editable && k === pathKey(entry.sel);
      const unknown = n.kind === "library" && !known.has(n.name);
      const card = el("div", { className: `pn k-${n.kind}${n.change ? ` c-${n.change}` : ""}${sel ? " sel" : ""}`, draggable: editable && path.length > 0 });
      card.append(el("span", { className: "pk", textContent: KIND_LABEL[n.kind] ?? n.kind }), el("code", { className: "pname", textContent: n.name }));
      if (n.change) card.append(el("span", { className: "pc", textContent: n.change }));
      if (unknown) card.append(el("span", { className: "pu", title: "This name is not in the documentation of the uu5-development plugin: check it or mark it as new.", textContent: "not in the docs" }));
      for (const [on, text, title] of [[n.relation, "×N", "Rendered once per item (1:N)"], [n.render, "R", `Rendered only when: ${n.render}`], [n.disabled, "D", `Disabled when: ${n.disabled}`], [n.label, `// ${n.label}`, "The data it shows"], [n.low, "low", "Low importance"]]) if (on) card.append(el("span", { className: "pc", textContent: text, title }));
      if (n.data) card.append(el("span", { className: "pnote", textContent: `← ${n.data}` }));
      if (n.note) card.append(el("span", { className: "pnote", textContent: n.note }));
      if (editable) {
        card.onclick = () => { entry.sel = path; ctx.change(entry); };
        card.ondragstart = (e) => { drag.from = path; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", pathKey(path)); card.classList.add("dragging"); };
        card.ondragend = () => { drag.from = null; card.classList.remove("dragging"); for (const x of root.querySelectorAll(".drop-before,.drop-after,.drop-inside")) x.classList.remove("drop-before", "drop-after", "drop-inside"); };
        card.ondragover = (e) => {
          if (!drag.from) return;
          const pos = zone(e, card); e.preventDefault(); e.dataTransfer.dropEffect = "move";
          card.classList.remove("drop-before", "drop-after", "drop-inside"); card.classList.add(`drop-${pos}`);
        };
        card.ondragleave = () => card.classList.remove("drop-before", "drop-after", "drop-inside");
        card.ondrop = (e) => {
          if (!drag.from) return;
          e.preventDefault();
          const r = moveTo(entry.tree, drag.from, path, zone(e, card)); drag.from = null;
          if (r.tree !== entry.tree) touch(r.tree, r.path);
        };
      } else if (n.kind === "library" && !unknown) {
        card.classList.add("click"); card.title = "Show the description of this component";
        card.onclick = () => ctx.showDetail?.(n.name, li);
      }
      const li = el("li", {}, card);
      if (n.children?.length) li.append(el("ul", {}, ...n.children.map((c, i) => node(c, [...path, i]))));
      return li;
    };
    return el("ul", { className: "plan-tree" }, node(entry.tree, []));
  }

  // ----- the editor of the selected node
  if (editable && entry.tree && !(entry.mode === "diagram" && entry.full)) root.append(nodeEditor());
  function nodeEditor() {
    const path = getNode(entry.tree, entry.sel) ? entry.sel : (entry.sel = []);
    const n = getNode(entry.tree, path), box = el("div", { className: "plan-node" });
    const tools = el("div", { className: "plan-tools" });
    const btn = (label, title, fn, disabled = false) => el("button", { type: "button", textContent: label, title, disabled, onclick: fn });
    const apply = (r) => touch(r.tree, r.path);
    const idx = path.at(-1), parent = path.length ? getNode(entry.tree, path.slice(0, -1)) : null;
    tools.append(
      btn("＋ Child", "Add a component inside the selected one", () => apply(addChild(entry.tree, path))),
      btn("＋ Sibling", "Add a component after the selected one", () => apply(addSibling(entry.tree, path)), !path.length),
      btn("Duplicate", "Copy the selected component with everything inside it", () => apply(duplicateNode(entry.tree, path)), !path.length),
      btn("Delete", "Remove the selected component with everything inside it", () => touch(removeNode(entry.tree, path), path.slice(0, -1)), !path.length),
      btn("↑", "Move up among its siblings", () => apply(moveNode(entry.tree, path, -1)), !path.length || idx === 0),
      btn("↓", "Move down among its siblings", () => apply(moveNode(entry.tree, path, 1)), !path.length || idx >= (parent?.children?.length ?? 1) - 1),
      btn("⇥", "Indent: make it a child of the sibling above", () => apply(indentNode(entry.tree, path)), !path.length || idx === 0),
      btn("⇤", "Outdent: move it out of its parent", () => apply(outdentNode(entry.tree, path)), path.length < 2),
    );
    const name = el("input", { type: "text", value: n.name, spellcheck: false, "aria-label": "Name" });
    name.onchange = () => touch(updateNode(entry.tree, path, { name: name.value }));
    const pick = el("button", { type: "button", className: "pedit", textContent: "Choose from libraries…", title: "Pick a component of the uu5 libraries for this node", onclick: async () => {
      const chosen = await ctx.chooseComponent?.();
      if (chosen) touch(updateNode(entry.tree, path, { name: chosen, kind: "library" }));
    } });
    const kind = el("select", { "aria-label": "Kind" }, ...KINDS.map((k) => el("option", { value: k, textContent: k })));
    kind.value = n.kind; kind.onchange = () => touch(updateNode(entry.tree, path, { kind: kind.value }));
    const change = el("select", { "aria-label": "Change" }, el("option", { value: "", textContent: "(no change)" }), ...CHANGES.map((c) => el("option", { value: c, textContent: c })));
    change.value = n.change ?? ""; change.onchange = () => touch(updateNode(entry.tree, path, { change: change.value }));
    const note = el("input", { type: "text", value: n.note ?? "", spellcheck: false, placeholder: "Why, or what it does", "aria-label": "Note" });
    note.onchange = () => touch(updateNode(entry.tree, path, { note: note.value }));
    const field = (label, ...ctrl) => el("label", { className: "plan-field" }, el("span", { textContent: label }), el("div", { className: "plan-ctrl" }, ...ctrl));
    const txt = (key, label, placeholder) => { const i = el("input", { type: "text", value: n[key] ?? "", spellcheck: false, placeholder, "aria-label": label }); i.onchange = () => touch(updateNode(entry.tree, path, { [key]: i.value })); i.onkeydown = (e) => { if (e.key === "Enter") i.blur(); }; return i; };
    const many = el("input", { type: "checkbox", checked: n.relation === "1:N", "aria-label": "Rendered once per item" }); many.onchange = () => touch(updateNode(entry.tree, path, { relation: many.checked ? "1:N" : "" }));
    const low = el("input", { type: "checkbox", checked: n.low === true, "aria-label": "Low importance" }); low.onchange = () => touch(updateNode(entry.tree, path, { low: low.checked }));
    box.append(tools, field("Name", name, pick), field("Kind", kind), field("Change", change), field("Note", note),
      field("Repeated", many, el("span", { className: "mute", textContent: "1:N, once per item" }), low, el("span", { className: "mute", textContent: "low importance" })),
      field("Data", txt("data", "Data from the parent", "What it receives from its parent")), field("// label", txt("label", "Label of the data", "header, text, onDelete…")),
      field("R", txt("render", "Render condition", "Rendered only when…")), field("D", txt("disabled", "Disable condition", "Disabled when…")));
    for (const i of [name, note]) i.onkeydown = (e) => { if (e.key === "Enter") i.blur(); };
    return box;
  }

  // ----- actions: the quiet ones on the left, the way forward on the right (Build this is the only filled button)
  const actions = el("div", { className: "plan-actions" }), left = el("div", { className: "pa-left" }), right = el("div", { className: "pa-right" });
  const btn = (label, fn, cls = "") => el("button", { type: "button", className: cls, textContent: label, onclick: fn });
  if (entry.state === "proposed") {
    if (editable) {
      left.append(btn("Reset to the agent's plan", () => {
        entry.text = entry.original.text; entry.tree = entry.original.tree ? JSON.parse(JSON.stringify(entry.original.tree)) : entry.tree; entry.sel = []; ctx.checkNames?.(entry); ctx.change(entry);
      }));
      right.append(btn("Done editing", () => { entry.editing = false; ctx.change(entry); }));
    } else left.append(btn("Edit plan", () => { entry.editing = true; ctx.change(entry); }), btn("Revise…", () => ctx.revise(entry)));
    const given = (entry.questions ?? []).filter((q) => isAnswered(entry.answers?.[q.id])).length;
    if (given) actions.append(btn("Update the plan with my answers", () => ctx.answer(entry), "pa-wide"));
    if (editable) left.append(btn("Revise…", () => ctx.revise(entry)));
    right.append(btn("Discard", () => ctx.discard(entry), "danger"), btn(editable ? "Build the edited plan" : "Build this", () => ctx.build(entry), "primary"));
    actions.append(left, right);
    root.append(actions);
  }
  return root;
}

/** Where on the card a drop lands: the upper quarter puts the node before it, the lower quarter after it, the middle inside it. */
function zone(e, card) {
  const r = card.getBoundingClientRect(), y = (e.clientY - r.top) / Math.max(1, r.height);
  return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
}
