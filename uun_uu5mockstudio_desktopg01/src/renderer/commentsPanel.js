/**
 * Comments on screens and their components (main/comments.mjs): a dialog from the toolbar icon (with the number of open comments),
 * and "Comment on this" in the inspector, which opens it with the marked component filled in. Files beside the screens, no server:
 * a colleague gets them with the project folder or the ZIP. `api` = window.studio.
 */
import { closeButton } from "./dialogChrome.js";
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });
const ago = (t, now = Date.now()) => { const m = Math.round((now - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function createCommentsPanel({ api, getScreens, getSelected = () => null, onCount = () => {}, onCounts = () => {}, onShow = () => {}, toast = () => {} }) {
  const box = el("div"); box.id = "cmtbox"; box.hidden = true;
  box.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="cm-title">
    <div class="cm-head"><h2 id="cm-title">Comments</h2><span class="grow"></span>
      <span class="cm-filter" role="radiogroup" aria-label="Show"><button type="button" role="radio" data-f="open">Open</button><button type="button" role="radio" data-f="all">All</button></span>
      </div>
    <div class="cm-list"></div>
    <form class="cm-new"><div class="cm-on"></div><div class="cm-row"><select class="cm-screen" aria-label="Screen"></select><textarea rows="2" placeholder="Write a comment…" aria-label="Comment"></textarea></div>
      <div class="cm-row2"><span class="cm-me mute"></span><span class="grow"></span><button type="submit" class="primary" disabled>Add comment</button></div></form></div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  let all = {}, filter = "open", target = null, author = "me";

  const total = () => Object.values(all).flat().filter((c) => c.status === "open").length;
  async function load() {
    const r = await api.commentsAll().catch(() => null);
    all = r && !r.error ? r : {};
    onCount(total()); onCounts(counts()); if (!box.hidden) paint();
  }
  const counts = () => Object.fromEntries(Object.entries(all).map(([f, cs]) => [f, cs.filter((c) => c.status === "open").length]).filter(([, n]) => n));
  function paint() {
    const screens = getScreens(), list = q(".cm-list"), sel = q(".cm-screen");
    const keep = sel.value; sel.replaceChildren(...screens.map((f) => Object.assign(el("option"), { value: f, textContent: f.replace(/\.html$/, "") })));
    sel.value = screens.includes(keep) ? keep : (screens.includes(getSelected()) ? getSelected() : screens[0] ?? "");
    for (const b of box.querySelectorAll(".cm-filter button")) { const on = b.dataset.f === filter; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
    const groups = Object.entries(all).filter(([f]) => screens.includes(f)).map(([f, cs]) => [f, cs.filter((c) => filter === "all" || c.status === "open")]).filter(([, cs]) => cs.length);
    list.replaceChildren(...(groups.length ? groups.map(([f, cs]) => group(f, cs)) : [el("p", "mute cm-none", filter === "open" ? "No open comment. Mark a component in the inspector and choose “Comment on this”, or write one below." : "No comment yet.")]));
    const on = q(".cm-on"); on.replaceChildren();
    if (target) { on.append(el("span", "", "On: "), el("b", "", target.name || "screen"), ...(target.text ? [el("span", "mute", ` “${target.text}”`)] : []), Object.assign(el("button", "cm-x", "✕"), { type: "button", title: "Comment on the whole screen", onclick: () => { target = null; paint(); } })); }
    on.hidden = !target;
    q(".cm-me").textContent = `You are ${author}`;
  }
  function group(file, cs) {
    const g = el("section", "cm-group"), h = el("h3");
    const name = Object.assign(el("button", "cm-screenlink", file.replace(/\.html$/, "")), { type: "button", title: "Show the screen", onclick: () => { close(); onShow(file); } });
    h.append(name, el("span", "mute", ` · ${cs.filter((c) => c.status === "open").length} open`)); g.append(h);
    for (const c of cs) g.append(card(file, c));
    return g;
  }
  async function change(file, op) {
    const r = await api.commentsChange(file, op);
    if (r?.error) return toast(r.error, { err: true });
    all = { ...all, [file]: r.comments }; if (!r.comments.length) delete all[file];
    onCount(total()); onCounts(counts()); paint();
  }
  function card(file, c) {
    const d = el("article", `cm-card${c.status === "resolved" ? " done" : ""}`);
    const meta = el("div", "cm-meta"); meta.append(el("b", "", c.author), el("span", "mute", ` · ${ago(c.created)}`));
    if (c.target?.name) meta.append(el("span", "cm-target", `${c.target.name}${c.target.text ? ` “${c.target.text}”` : ""}`));
    d.append(meta, el("p", "cm-text", c.text));
    for (const r of c.replies) { const p = el("p", "cm-reply"); p.append(el("b", "", r.author), ` ${r.text}`); d.append(p); }
    const acts = el("div", "cm-acts");
    const reply = el("input", "cm-replyin"); reply.placeholder = "Reply…"; reply.setAttribute("aria-label", "Reply");
    const send = () => { const t = reply.value.trim(); if (t) change(file, { type: "reply", id: c.id, text: t }); };
    reply.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } };
    const mk = (label, fn, cls = "") => Object.assign(el("button", cls, label), { type: "button", onclick: fn });
    acts.append(reply, mk(c.status === "open" ? "Resolve" : "Reopen", () => change(file, { type: c.status === "open" ? "resolve" : "reopen", id: c.id })), mk("Delete", () => change(file, { type: "delete", id: c.id }), "cm-del"));
    d.append(acts);
    if (c.status === "resolved") d.append(el("p", "mute cm-by", `Resolved by ${c.resolvedBy ?? "someone"}`));
    return d;
  }
  function close() { box.hidden = true; }
  q(".cm-head").append(closeButton(close));
  for (const b of box.querySelectorAll(".cm-filter button")) b.onclick = () => { filter = b.dataset.f; paint(); };
  const ta = q("textarea"), add = q(".cm-new button.primary");
  ta.oninput = () => { add.disabled = !ta.value.trim(); };
  ta.onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); q(".cm-new").requestSubmit(); } };
  q(".cm-new").onsubmit = (e) => {
    e.preventDefault();
    const text = ta.value.trim(), file = q(".cm-screen").value; if (!text || !file) return;
    ta.value = ""; add.disabled = true;
    change(file, { type: "add", text, target: target && target.file === file ? { name: target.name, text: target.text, ordinal: target.ordinal } : {} });
  };
  q(".cm-me").onclick = async () => { const n = window.prompt("Your name in comments", author); if (n === null) return; const r = await api.commentsAuthor(n); author = r.author ?? author; paint(); };
  box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
  box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });

  return {
    /** `screen`: preselected; `on`: { file, name, text, ordinal } of a marked component. */
    async open({ screen, on = null } = {}) {
      target = on; await load(); author = (await api.commentsAuthor().catch(() => null))?.author ?? author;
      box.hidden = false; paint();
      const sel = q(".cm-screen"); const want = on?.file ?? screen; if (want && getScreens().includes(want)) sel.value = want;
      ta.focus();
    },
    reload: load,
    isOpen: () => !box.hidden,
  };
}
