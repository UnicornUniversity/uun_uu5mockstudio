/**
 * The Plus4U link in the project toolbar, kept to one control. Not linked: one quiet link icon (links the project to a document). Linked:
 * a chip with the name of the document and one dot: orange = someone uploaded a newer version, blue = your changes are not uploaded (orange
 * wins); a spinner instead of the document icon while it syncs. The chip opens the menu: Upload and Download first (each says where it
 * stands), then open in Plus4U, publish a screen / the sitemap, link another, unlink. The remote check runs only with a kept token (it never
 * opens a sign-in window); without one, Download offers to sign in. The actions themselves are those of plus4uSync.js (`sync.run`).
 */
const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  link: svg('<path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>'),
  doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>'),
  up: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8"/><path d="m9 15 3-3 3 3"/>'),
  down: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8"/><path d="m9 17 3 3 3-3"/>'),
  lock: svg('<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>'),
  caret: '<svg class="zcar" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>',
  spin: svg('<path d="M21 12a9 9 0 1 1-6.2-8.56"/>'),
};

/** What the toolbar shows for a state from plus4u:syncState: pure, so it can be tested. */
export function viewOf(st, busy = null) {
  if (!st || st.error) return { mode: "none" };
  if (!st.linked) return { mode: "unlinked" };
  const name = st.info?.name || "Plus4U document";
  const synced = st.info?.syncedAt ? new Date(st.info.syncedAt) : null;
  return {
    mode: "linked", name,
    sub: `${st.info?.entity ?? "document"}${synced ? ` · synced ${synced.toLocaleString()}` : " · not uploaded yet"}`,
    chip: { busy: Boolean(busy), dot: st.remoteChanged === true ? "remote" : st.localChanged ? "local" : null },
    upload: { busy: busy === "upload", dot: Boolean(st.localChanged), label: busy === "upload" ? "Uploading…" : "Upload", sub: st.localChanged ? (st.uploaded ? "Your changes are not uploaded yet" : "The project is not uploaded yet") : "No changes since the last sync", title: busy === "upload" ? "Uploading…" : st.localChanged ? (st.uploaded ? `Upload your changes to “${name}”` : `Upload the project to “${name}” (not uploaded yet)`) : `Upload to “${name}” (no changes since the last sync)` },
    download: { busy: busy === "download", dot: st.remoteChanged === true, lock: Boolean(st.needsLogin) && st.remoteChanged == null, label: busy === "download" ? "Downloading…" : Boolean(st.needsLogin) && st.remoteChanged == null ? "Sign in to check for a newer version" : "Download", sub: st.remoteChanged ? "A newer version is in Plus4U" : st.needsLogin && st.remoteChanged == null ? "Your Plus4U sign-in expired" : "Replace the project with the uploaded version", title: busy === "download" ? "Downloading…" : st.remoteChanged ? `Download the newer version from “${name}”` : st.needsLogin ? "Sign in to Plus4U to check for a newer version" : `Download from “${name}”` },
  };
}

export function createPlus4uBar({ root, api = window.studio, sync, dismissMenus = () => {}, toast = () => {} }) {
  let st = null, busy = null, seq = 0, enabled = false; // nothing of Plus4U shows while signed out
  const menu = Object.assign(document.createElement("div"), { id: "p4umenu", hidden: true });
  menu.setAttribute("role", "menu");
  document.body.append(menu);

  const button = (cls, html, title, onClick) => {
    const b = Object.assign(document.createElement("button"), { type: "button", className: cls, title });
    b.setAttribute("aria-label", title); b.innerHTML = html;
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(b); });
    return b;
  };

  function paint() {
    const v = enabled ? viewOf(st, busy) : { mode: "none" };
    root.replaceChildren();
    root.hidden = v.mode === "none";
    if (!enabled) menu.hidden = true;
    if (v.mode === "unlinked") { root.append(button("icon p4u-ib", ICONS.link, "Link the project to a Plus4U document", () => sync.run("p4u-link"))); return; }
    if (v.mode !== "linked") return;
    const c = v.chip;
    const chip = button(`p4u-chip${c.dot ? ` p4u-dot-${c.dot}` : ""}${c.busy ? " busy" : ""}`, `${c.busy ? ICONS.spin : ICONS.doc}<span class="p4u-name"></span>${c.dot && !c.busy ? '<i class="p4u-dot"></i>' : ""}${ICONS.caret}`, [v.name, v.sub, c.busy ? (busy === "upload" ? "Uploading…" : "Downloading…") : c.dot === "remote" ? "A newer version is in Plus4U" : c.dot === "local" ? v.upload.sub : ""].filter(Boolean).join(" · "), (b) => openMenu(b));
    chip.querySelector(".p4u-name").textContent = v.name;
    chip.setAttribute("aria-haspopup", "menu");
    root.append(chip);
  }

  async function act(k, s) {
    if (busy) return;
    if (k === "download" && s.lock) { // sign in first, then look again
      const r = await api.plus4uAccess(st.info.url, { interactive: true });
      if (r?.error) { if (!/cancel/i.test(r.error)) toast(`Plus4U sign-in failed: ${r.error}`, { err: true }); return; }
      return refresh({ remote: true });
    }
    await sync.run(k === "upload" ? "p4u-upload" : "p4u-download");
  }

  function openMenu(anchor) {
    if (!menu.hidden) { menu.hidden = true; return; }
    dismissMenus();
    const v = viewOf(st, busy);
    if (v.mode !== "linked") return;
    menu.replaceChildren();
    const sep = () => menu.append(Object.assign(document.createElement("span"), { className: "pm-sep" }));
    const head = Object.assign(document.createElement("div"), { className: "p4u-mhead" });
    head.innerHTML = ICONS.doc;
    const t = document.createElement("div");
    t.append(Object.assign(document.createElement("b"), { textContent: v.name }), Object.assign(document.createElement("span"), { className: "mute", textContent: v.sub }));
    head.append(t); menu.append(head); sep();
    // Upload and Download, each with where it stands
    for (const [k, icon] of [["upload", ICONS.up], ["download", ICONS.down]]) {
      const s = v[k];
      const b = Object.assign(document.createElement("button"), { type: "button", className: `p4u-sync${s.dot ? ` p4u-dot-${k}` : ""}`, title: s.title, disabled: Boolean(busy) });
      b.setAttribute("role", "menuitem");
      b.innerHTML = `${s.busy ? ICONS.spin : s.lock ? ICONS.lock : icon}<span class="p4u-st"><span class="p4u-l"></span><span class="mute"></span></span>${s.dot ? '<i class="p4u-dot"></i>' : ""}`;
      b.querySelector(".p4u-l").textContent = s.label; b.querySelector(".mute").textContent = s.sub;
      b.onclick = (e) => { e.stopPropagation(); menu.hidden = true; act(k, s); };
      menu.append(b);
    }
    sep();
    for (const it of sync.chipItems()) {
      if (!it) { sep(); continue; }
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: it[1] });
      b.setAttribute("role", "menuitem");
      b.onclick = (e) => { e.stopPropagation(); menu.hidden = true; sync.run(it[0]); };
      menu.append(b);
    }
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  }
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { menu.hidden = true; e.stopPropagation(); } }, true);

  /** Reads the state again; `remote` also asks Plus4U whether someone uploaded (only with a kept token). Keeps a known remote answer otherwise. */
  async function refresh({ remote = false } = {}) {
    const my = ++seq;
    const r = await api.plus4uSyncState?.({ remote }).catch(() => null);
    if (my !== seq) return; // a newer refresh is on its way
    const prev = st;
    st = r && !r.error ? r : null;
    if (st?.linked && !remote && prev?.linked && prev.info?.url === st.info?.url) { st.remoteChanged = prev.remoteChanged; st.needsLogin = prev.needsLogin; }
    paint();
  }
  function setBusy(kind) { busy = kind; paint(); }
  /** Signed in to Plus4U (a usable token): only then the link, the sync and the publishing show. */
  function setEnabled(on) { if (enabled === Boolean(on)) return; enabled = Boolean(on); paint(); if (enabled) refresh({ remote: true }); }
  function clear() { st = null; busy = null; menu.hidden = true; paint(); }

  paint();
  return { refresh, setBusy, setEnabled, clear, state: () => st };
}
