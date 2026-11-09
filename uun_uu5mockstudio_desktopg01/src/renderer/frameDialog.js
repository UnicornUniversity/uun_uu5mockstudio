/**
 * "New frame from a link…": a link to a real page (Management Kit, BookKit, any web page) -> a window opens, the user chooses the content area there
 * -> name and place (this project / all projects) -> the frame is saved and can be chosen in "Shown in". Optionally Claude tidies the frame up
 * (variables for the title and breadcrumb, a repeated menu written once). `api` = window.studio; resolves to null, or { saving: Promise<env id | null> } as soon as the dialog is closed (the frame is written in the background).
 */
import { openFrameEdit } from "./frameEditDialog.js";
import { closeButton } from "./dialogChrome.js";
/** The hand editor of a frame (HTML, CSS, offsets) is built but hidden: set to true to show "Edit the code…" in the edit dialog. */
const SHOW_CODE_EDITOR = false;
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n; };

export function tidyPrompt({ dir, url }) {
  return `Tidy up the frame in ${dir} (frame.html, frame.css). It was captured from ${url}: every part of the page outside the content area is a flat, absolutely positioned box. `
    + `Tidy it up WITHOUT CHANGING HOW IT LOOKS: every part must stay exactly where it is and keep its size (keep position: fixed/absolute with the same coordinates; do not turn the layout into flex or grid, do not rely on margins, auto widths or the width of neighbours: the result must be pixel-identical to the capture, whatever the window width). `
    + `What you may do: give the parts meaningful class names and move repeated styles into shared classes in frame.css, replace the title of the page with {{title}} and the breadcrumb with {{breadcrumb}} (the app fills them in for every screen), and group related parts. `
    + `Do not drop anything: every visible part outside the content area (see shot.jpg in .studio/frames-draft, the page as it was) must stay, including buttons, badges and menu icons. Small pictures of icons and photos are files in the img/ folder of the frame, referenced as frame-img/<name>: keep those references as they are and do not open the pictures. `
    + `Do not change frame.json. Keep the content area empty: the screen is drawn there.`;
}

export function openFrameDialog({ api, toast = () => {}, send = null, edit = null }) {
  return new Promise((resolve) => {
    const url = h("input", { placeholder: "https://uuapp.plus4u.net/…", spellcheck: false, value: edit?.url ?? "" });
    const name = h("input", { placeholder: "Name of the frame", maxLength: 60, value: edit?.label ?? "" });
    const scopeP = h("input", { type: "radio", name: "frscope", value: "project", checked: edit?.scope !== "global" }), scopeG = h("input", { type: "radio", name: "frscope", value: "global", checked: edit?.scope === "global" });
    const scope = () => (scopeG.checked ? "global" : "project");
    const scopeNote = h("small", { className: "mute" });
    const syncNote = () => { scopeNote.textContent = edit && scope() !== edit.scope ? (scope() === "project" ? "It will disappear from the other projects." : "It will be available in all projects.") : ""; };
    scopeP.onchange = scopeG.onchange = syncNote;
    // who sees the frame: this project only, or all projects (also changeable later: Edit)
    const scopeBox = h("fieldset", { className: "tsd-screens" }, h("legend", { textContent: edit ? "Visible in" : "Keep it" }),
      h("label", {}, scopeP, h("span", { textContent: "This project only" + (edit ? "" : " (default)") })),
      h("label", {}, scopeG, h("span", { textContent: "All projects" })), scopeNote);
    const tidy = h("input", { type: "checkbox", checked: Boolean(send), disabled: !send });
    const err = h("p", { className: "tsd-err" });
    const go = h("button", { type: "button", className: "primary", textContent: "Choose the content area…" });
    const quick = h("button", { type: "button", textContent: "Save changes", title: "Only the name and where it is visible: the frame itself stays as it is" });
    const cancel = h("button", { type: "button", textContent: "Cancel" });
    let draft = null;
    // closes at once (a short fade); what is still to be done goes on in the background
    const close = (v) => { ov.classList.add("closing"); setTimeout(() => ov.remove(), 160); resolve(v); };
    cancel.onclick = () => close(null);
    const stage2 = h("div", { hidden: true }), info = h("p", { className: "mute" });
    const field = (label, input) => h("label", { className: "tsd-f" }, h("span", { textContent: label }), input);
    /** Moves the frame to the visibility chosen (when it differs); returns { env, dir } of where it is now. */
    const place = async (env, dir) => {
      if (!edit || scope() === edit.scope) return { env, dir };
      const m = await api.frameMove(env, scope());
      if (m?.error) { toast(m.error, { err: true }); return { env, dir }; }
      return m;
    };

    go.onclick = async () => {
      if (draft) return save();
      err.textContent = "";
      if (!/^https:\/\//i.test(url.value.trim())) { err.textContent = "Paste a link that starts with https://"; return; }
      go.disabled = true; quick.disabled = true; go.textContent = "Waiting for the window…";
      const r = await api.frameCapture(url.value.trim(), edit?.env);
      go.disabled = false; quick.disabled = false;
      if (r?.error) { err.textContent = r.error; go.textContent = "Choose the content area…"; return; }
      if (!r?.ok) { go.textContent = "Choose the content area…"; return; } // window closed without a choice
      draft = r; info.textContent = `Taken from the page: ${r.boxes} parts. The content area stays free for the screen.`; stage2.hidden = false; url.disabled = true; quick.hidden = true;
      if (!name.value) name.value = (r.title || "").slice(0, 60);
      go.textContent = "Save frame"; if (!edit) { name.focus(); name.select(); }
    };
    function save() { // after a capture: the frame is written (new, or the capture replaces the parts of the existing one)
      if (!name.value.trim()) { err.textContent = "The frame needs a name."; return; }
      const label = name.value.trim(), wantTidy = tidy.checked && send;
      // the dialog is gone at once; the frame is written meanwhile and the caller shows that it is being saved
      const saving = (async () => {
        const r = edit ? await api.frameApplyDraft(edit.env, label) : await api.frameSaveDraft(scope(), label);
        if (r?.error) { toast(r.error, { err: true }); return null; }
        const at = await place(edit ? edit.env : r.env, r.dir);
        toast(edit ? `Frame “${label}” taken again from the page.` : `Frame “${label}” saved: choose it in “Shown in”.`);
        if (wantTidy) send(tidyPrompt({ dir: at.dir, url: draft.url }));
        return at.env;
      })();
      close({ saving });
    }
    quick.onclick = () => { // editing without a new capture: the name and where the frame is visible
      if (!name.value.trim()) { err.textContent = "The frame needs a name."; return; }
      const label = name.value.trim();
      const saving = (async () => {
        const u = await api.frameUpdate(edit.env, { label });
        if (u?.error) { toast(u.error, { err: true }); return null; }
        const at = await place(edit.env, null);
        toast(`Frame “${label}” saved.`);
        return at.env;
      })();
      close({ saving });
    };
    quick.hidden = !edit;
    stage2.append(...[
      info,
      edit ? null : field("Name", name),
      edit ? null : scopeBox,
      h("label", {}, tidy, h("span", { textContent: " Let Claude tidy it up (title and breadcrumb become variables)" }))].filter(Boolean)); // (append would write a null as the text "null")
    const code = h("button", { type: "button", textContent: "Edit the code…", title: "Name, offsets, HTML and CSS of the frame by hand, or ask Claude to change it" });
    code.onclick = async () => { const changed = await openFrameEdit({ api, env: edit.env, toast, send }); if (changed) close({ saving: Promise.resolve(edit.env) }); };
    const ov = h("div", { className: "tsdbox", onmousedown: (e) => { if (e.target === ov) close(null); } },
      h("div", { className: "card", role: "dialog" },
        h("div", { className: "dlg-head" }, h("h2", { textContent: edit ? `Edit frame “${edit.label}”` : "New frame from a link" }), closeButton(() => close(null))),
        h("div", { className: "tsd-body" },
          ...(edit ? [field("Name", name), scopeBox] : []),
          h("p", { className: "mute", textContent: "A window opens with the page: sign in there if it needs it and open the page. Then press “Choose content area” and click or drag over the area where the content of a page goes: everything around it becomes the frame." }),
          field("Link to the page", url), stage2, err),
        h("div", { className: "row" }, edit && SHOW_CODE_EDITOR ? code : null, h("span", { className: "grow" }), cancel, quick, go)));
    ov.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } });
    document.body.append(ov);
    (edit ? name : url).focus();
  });
}
