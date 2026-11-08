/**
 * "Save as Template…": a template of my own made from screens of the open project (create), or a change of one of my templates (edit).
 * Create: title, id, level, kind, description, the sentence for the message field, the screens, instructions for the agent and whether the
 * business rules and the notes of the screens go with it (main writes TEMPLATE.md from them). Edit: the same fields and the whole TEMPLATE.md;
 * the screens of the template stay. `api` = window.studio; resolves to the saved id or null.
 */
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n; };

/** kebab-case id from a title (the same rule as `slugify` in templates.mjs). */
export const idFrom = (title) => String(title ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");

export function openTemplateSave({ api, files = [], id: editId = null, toast = () => {} }) {
  return new Promise(async (resolve) => {
    const edit = Boolean(editId);
    const d = edit ? await api.templatesGet(editId) : await api.templatesDraft(files);
    if (!d || d.error) { toast(d?.error ?? "The template could not be read.", { err: true }); return resolve(null); }
    const levels = edit ? (await api.templatesList()).levels : d.levels, kinds = d.kinds ?? ["form", "list", "detail", "dashboard", "portal", "landing", "home", "product", "news", "report"];
    const taken = new Set(d.taken ?? []);

    const field = (label, input, hint) => h("label", { className: "tsd-f" }, h("span", { textContent: label }), input, hint ? h("small", { className: "mute", textContent: hint }) : null);
    const title = h("input", { value: d.title ?? "", spellcheck: true, maxLength: 80 });
    const id = h("input", { value: edit ? d.id : d.id ?? "", spellcheck: false, maxLength: 64 });
    let idTouched = edit;
    const level = h("select", {}, ...Object.entries(levels).map(([k, v]) => h("option", { value: k, textContent: v, selected: k === d.level })));
    const kind = h("select", {}, h("option", { value: "", textContent: "(by level)" }), ...kinds.map((k) => h("option", { value: k, textContent: k, selected: k === d.kind })));
    const desc = h("input", { value: d.description ?? "", placeholder: "One sentence: shown on the chip and in the list", maxLength: 300 });
    const prompt = h("textarea", { rows: 2, value: d.prompt ?? "", placeholder: "Put into the message field when the template is chosen", maxLength: 400 });
    const err = h("p", { className: "tsd-err" });

    // create: which screens, the instructions, rules and notes; edit: the whole TEMPLATE.md
    const picks = edit ? [] : (d.screens ?? []).map((f) => h("input", { type: "checkbox", value: f, checked: d.files.includes(f) }));
    const instr = h("textarea", { className: "mono", rows: edit ? 12 : 5, value: edit ? d.markdown ?? "" : "", spellcheck: true,
      placeholder: edit ? "" : "What the agent should keep, what it should change, what this template is for…" });
    const withRules = h("input", { type: "checkbox", checked: true }), withNotes = h("input", { type: "checkbox", checked: true });

    const syncId = () => { if (!idTouched) id.value = idFrom(title.value); check(); };
    const check = () => {
      const v = id.value.trim();
      err.textContent = !title.value.trim() ? "The template needs a title." : !/^[a-z0-9][a-z0-9-]{0,63}$/.test(v) ? "The id must be kebab-case (a-z, 0-9, -)."
        : !edit && !picks.some((p) => p.checked) ? "Choose at least one screen." : "";
      replace.hidden = !(taken.has(v) && v !== editId);
      save.textContent = replace.hidden ? "Save template" : "Replace template";
      save.disabled = Boolean(err.textContent);
    };
    title.oninput = syncId;
    id.oninput = () => { idTouched = true; check(); };
    for (const p of picks) p.onchange = () => {
      const n = picks.filter((x) => x.checked).length;
      if (!edit && n > 1 && level.value !== "app") level.value = "app"; // several screens: an application
      check();
    };

    const replace = h("p", { className: "tsd-warn", hidden: true, textContent: "A template of yours has this id: saving replaces it." });
    const save = h("button", { type: "button", className: "primary", textContent: "Save template" });
    const cancel = h("button", { type: "button", textContent: "Cancel" });
    const close = (v) => { ov.remove(); resolve(v); };
    cancel.onclick = () => close(null);
    save.onclick = async () => {
      check(); if (save.disabled) return;
      const t = { title: title.value.trim(), id: id.value.trim(), level: level.value, kind: kind.value || null, description: desc.value.trim(), prompt: prompt.value.trim() };
      save.disabled = true;
      const r = edit ? await api.templatesUpdate(editId, { ...t, markdown: instr.value })
        : await api.templatesSave({ ...t, files: picks.filter((p) => p.checked).map((p) => p.value), instructions: instr.value, withRules: withRules.checked, withNotes: withNotes.checked, overwrite: !replace.hidden });
      save.disabled = false;
      if (r?.error) { err.textContent = r.error; return; }
      if (r?.exists) { taken.add(t.id); check(); return; } // created meanwhile: ask to replace
      toast(edit ? `Template “${t.title}” saved.` : `Template “${t.title}” saved to My templates: choose it on the dashboard under ${levels[t.level]}.`);
      close(r.id);
    };

    const body = h("div", { className: "tsd-body" },
      h("div", { className: "tsd-row" }, field("Category", level, "Where it appears on the dashboard"), field("Kind (icon)", kind)),
      h("div", { className: "tsd-row" }, field("Title", title), field("Id", id, "The folder name; kebab-case")),
      field("Description", desc),
      field("Sentence for the message field", prompt),
      edit ? null : h("fieldset", { className: "tsd-screens" }, h("legend", { textContent: "Screens" }), ...picks.map((p) => h("label", {}, p, h("span", { textContent: p.value })))),
      edit ? null : (d.local?.length ? h("p", { className: "tsd-warn", textContent: `These screens refer to files of the project that do not go into the template: ${d.local.slice(0, 4).join(", ")}${d.local.length > 4 ? " …" : ""}. Use web addresses or placeholders instead.` }) : null),
      field(edit ? "Instructions for the agent (TEMPLATE.md)" : "Instructions for the agent", instr, edit ? null : "Optional. They go into TEMPLATE.md with what is ticked below."),
      edit ? null : h("div", { className: "tsd-checks" },
        d.hasRules ? h("label", {}, withRules, h("span", { textContent: "Add the business rules of the project" })) : null,
        d.notes ? h("label", {}, withNotes, h("span", { textContent: `Add the notes of the screens (${d.notes})` })) : null),
      replace, err);
    const ov = h("div", { className: "tsdbox", onmousedown: (e) => { if (e.target === ov) close(null); } },
      h("div", { className: "card", role: "dialog" },
        h("div", { className: "dlg-head" }, h("h2", { textContent: edit ? `Edit template “${d.title}”` : "Save as template" })),
        body,
        h("div", { className: "row" }, h("span", { className: "grow" }), cancel, save)));
    ov.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } });
    document.body.append(ov);
    check();
    title.focus(); title.select();
  });
}
