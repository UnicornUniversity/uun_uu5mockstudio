const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });

/**
 * "Templates…": where the templates come from (built-in, installed plugins, my own folder) and the list of all of them.
 * `api` = window.studio (templatesList, templatesReveal, templates* of my own). My templates can be edited, shown in the Finder,
 * saved as a ZIP and deleted; `onNew()` saves screens of the open project as a template (offered when `canNew()` says a project is open), `onEdit(id)`
 * edits one of mine, `confirm(text)` asks before a delete.
 */
export function createTemplatesDialog({ api, onNew = null, canNew = () => Boolean(onNew), onEdit = null, confirm = async (t) => window.confirm(t), toast = () => {} }) {
  const box = $("tplbox"), sources = $("tp-sources"), list = $("tp-list"), err = $("tp-err");

  let finish = null;
  const close = () => { box.hidden = true; const f = finish; finish = null; f?.(); };
  function paint(d) {
    err.textContent = "";
    sources.replaceChildren(...d.sources.map((s) => {
      const card = el("div", "tp-src"), head = el("div", "tp-src-head");
      head.append(el("b", "", s.label), el("span", "mute", `${s.count} template${s.count === 1 ? "" : "s"}`));
      card.append(head);
      if (s.id === "mine") {
        const open = el("button", "tp-open", "Open folder"); open.type = "button"; open.title = s.path;
        open.onclick = async () => { const r = await api.templatesReveal(); if (r?.error) err.textContent = r.error; };
        card.append(el("p", "mute", "Saved from your screens, or template folders put here"), open);
        if (onNew && canNew()) { const mk = el("button", "tp-open", "Save a screen as template…"); mk.type = "button"; mk.onclick = async () => { close(); await onNew(); }; card.append(mk); }
      }
      for (const e of s.errors ?? []) card.append(el("p", "tp-bad", e));
      return card;
    }));
    list.replaceChildren(...Object.entries(d.levels).flatMap(([level, label]) => {
      const items = d.templates.filter((t) => t.level === level); if (!items.length) return [];
      return [el("h4", "", label), ...items.map((t) => {
        const r = el("div", "tp-item"), top = el("div", "tp-item-top");
        top.append(el("b", "", t.title), el("span", "tp-badge", t.source === "builtin" ? "built-in" : t.source.startsWith("plugin:") ? `plugin ${t.source.slice(7)}` : "mine"));
        r.append(top, el("span", "mute", t.description));
        if (t.source === "mine") r.append(mineActions(t));
        return r;
      })];
    }));
  }

  const act = (label, fn, cls = "") => { const b = el("button", cls, label); b.type = "button"; b.onclick = fn; return b; };
  const done = (r, ok) => { if (r?.error) err.textContent = r.error; else if (ok && !r?.canceled) toast(ok(r)); };
  function mineActions(t) {
    const acts = el("div", "tp-acts");
    if (onEdit) acts.append(act("Edit…", async () => { close(); await onEdit(t.id); }));
    acts.append(
        act("Show in Finder", async () => done(await api.templatesShow(t.id))),
        act("Export ZIP…", async () => done(await api.templatesZip(t.id), (r) => `Template saved: ${r.path.split("/").pop()}`)),
        act("Delete", async () => {
          if (!(await confirm(`Delete the template “${t.title}”? Its folder is removed.`))) return;
          const r = await api.templatesRemove(t.id); done(r);
          if (!r?.error) reload();
        }, "danger"));
    return acts;
  }
  async function reload() { const d = await api.templatesList().catch(() => null); if (d && !d.error) paint(d); else err.textContent = d?.error ?? "The templates could not be read."; }

  $("tp-x").onclick = close;
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    async open() {
      box.hidden = false; err.textContent = "";
      await reload();
      $("tp-x").focus();
      return new Promise((resolve) => { finish = resolve; }); // resolved when the dialog closes
    },
  };
}
