/**
 * "Edit frame": name, the offsets of the content area (px from the edges), the HTML and CSS of the frame; take it again from its page
 * (the capture window opens on the stored link; the new capture replaces the HTML, CSS, pictures and offsets); or ask Claude to change it
 * in the chat. `api` = window.studio; resolves to true when the frame was changed (saved or taken again), else false.
 */
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n; };

export function changePrompt({ dir, instruction }) {
  return `Change the frame in ${dir} (frame.html, frame.css; frame.json holds the offsets of the content area; small pictures are in img/ and referenced as frame-img/<name>): ${instruction}\n`
    + `Keep {{title}}, {{breadcrumb}} and {{parents}} (the app fills them in for every screen) and the references to frame-img/. Do not open the pictures. Keep the content area empty: the screen is drawn there.`;
}

export function openFrameEdit({ api, env, toast = () => {}, send = null }) {
  return new Promise(async (resolve) => {
    const d = await api.frameGet(env);
    if (!d || d.error) { toast(d?.error ?? "The frame could not be read.", { err: true }); return resolve(false); }
    let changed = false;
    const field = (label, input, hint) => h("label", { className: "tsd-f" }, h("span", { textContent: label }), input, hint ? h("small", { className: "mute", textContent: hint }) : null);
    const name = h("input", { value: d.label, maxLength: 60 });
    const off = Object.fromEntries(["top", "right", "bottom", "left"].map((k) => [k, h("input", { type: "number", min: 0, step: 1, value: String(d.offset[k] ?? 0), style: "width:90px" })]));
    const html = h("textarea", { className: "mono", rows: 9, value: d.html, spellcheck: false });
    const css = h("textarea", { className: "mono", rows: 9, value: d.css, spellcheck: false });
    const ask = h("textarea", { rows: 2, placeholder: "e.g. Make the top bar 8 px higher and the menu text bold", maxLength: 600 });
    const err = h("p", { className: "tsd-err" });
    const fill = (n) => { name.value = n.label; for (const k of Object.keys(off)) off[k].value = String(n.offset[k] ?? 0); html.value = n.html; css.value = n.css; };
    const close = (v) => { ov.classList.add("closing"); setTimeout(() => ov.remove(), 160); resolve(v); };

    const save = h("button", { type: "button", className: "primary", textContent: "Save" });
    const cancel = h("button", { type: "button", textContent: "Close" });
    const recapture = h("button", { type: "button", textContent: "Take again from the page…", title: d.url ? `Opens ${d.url}` : "" });
    const askBtn = h("button", { type: "button", textContent: "Ask Claude" });
    cancel.onclick = () => close(changed);
    save.onclick = async () => {
      err.textContent = ""; save.disabled = true;
      const r = await api.frameUpdate(env, { label: name.value.trim(), offset: Object.fromEntries(Object.entries(off).map(([k, i]) => [k, Math.max(0, Math.round(Number(i.value) || 0))])), html: html.value, css: css.value });
      save.disabled = false;
      if (r?.error) { err.textContent = r.error; return; }
      toast(`Frame “${name.value.trim()}” saved.`); close(true);
    };
    recapture.onclick = async () => {
      err.textContent = ""; recapture.disabled = true; recapture.textContent = "Waiting for the window…";
      const r = await api.frameRecapture(env, d.url);
      recapture.disabled = false; recapture.textContent = "Take again from the page…";
      if (r?.error) { err.textContent = r.error; return; }
      if (!r?.ok) return; // the window was closed without a choice
      changed = true; const n = await api.frameGet(env); if (!n?.error) fill(n);
      toast("The frame was taken again from the page.");
    };
    askBtn.disabled = !send;
    askBtn.onclick = () => {
      if (!ask.value.trim()) { err.textContent = "Write what Claude should change."; return; }
      send(changePrompt({ dir: d.dir, instruction: ask.value.trim() }));
      toast("Sent to Claude: when it is done, the screens show the change.");
      close(true);
    };

    const ov = h("div", { className: "tsdbox", onmousedown: (e) => { if (e.target === ov) close(changed); } },
      h("div", { className: "card", role: "dialog" },
        h("div", { className: "dlg-head" }, h("h2", { textContent: `Edit frame “${d.label}”` })),
        h("div", { className: "tsd-body" },
          field("Name", name),
          h("p", { className: "mute", textContent: `${d.scope === "global" ? "For all projects" : "In this project"}${d.url ? ` · from ${d.url}` : ""}` }),
          h("div", { className: "tsd-row" }, field("Content area from top (px)", off.top), field("from right", off.right), field("from bottom", off.bottom), field("from left", off.left)),
          field("HTML", html, "{{title}}, {{breadcrumb}}, {{parents}} are filled in for every screen; frame-img/… are the pictures of the frame."),
          field("CSS", css),
          h("div", { className: "tsd-row" }, recapture),
          field("Ask Claude to change it", ask), h("div", { className: "tsd-row" }, askBtn),
          err),
        h("div", { className: "row" }, h("span", { className: "grow" }), cancel, save)));
    ov.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(changed); } });
    document.body.append(ov);
    name.focus();
  });
}
