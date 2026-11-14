/**
 * The project menu items of the Plus4U link: link the project to an artifact of uuManagementKit (a document, keyTask …), upload the project
 * (a zip + the HTML of each screen) to its attachments, download it back, open the artifact, unlink. The work is done in the main process
 * (mkSync.mjs); this asks, confirms and reports. The same actions back the document chip and the sync buttons of the toolbar (plus4uBar.js).
 */
export function createPlus4uSync({ api = window.studio, toast, askText, askConfirm, flushSaves, reopen, currentScreen = () => null, screenUu5 = async () => ({ error: "No screen." }), sitemapUu5 = () => null, onChange = () => {}, onBusy = () => {} }) {
  let info = null; // the link of the open project, or null

  const label = () => (info?.name ? `“${info.name}”` : "the artifact");
  /** The link of the open project, read again (an action can start from the toolbar or the Share menu, not only from the project menu). */
  async function loadInfo() { const r = await api.plus4uLinkInfo().catch(() => null); info = r && !r.error ? r : null; return info; }

  /** [act, label] for the project menu (reads the link of the open project). */
  async function menuItems() {
    const screen = currentScreen();
    const publishItems = [];
    if (screen) publishItems.push(["p4u-publish-screen", `Publish “${screen.replace(/\.html$/, "")}” to a Plus4U page…`]);
    if (sitemapUu5()) publishItems.push(["p4u-publish-sitemap", "Publish the sitemap to a Plus4U page…"]);
    if (!(await loadInfo())) return [...publishItems, ["p4u-link", "Link to a Plus4U document…"]];
    return [...publishItems, ["p4u-upload", `Upload to ${label()}`], ["p4u-download", `Download from ${label()}…`], ["p4u-open", `Open ${label()} in Plus4U`], ["p4u-unlink", "Unlink the Plus4U document"]];
  }

  const fail = (r, what) => { if (r?.error) { toast(`${what}: ${r.error}`, { err: true }); return true; } return false; };
  const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso ?? ""; } };

  async function link() {
    const url = await askText({ title: "Address of the uuManagementKit document, keyTask or portal", ok: "Link" });
    if (!url) return;
    const r = await api.plus4uLink(url.trim());
    if (fail(r, "Linking failed")) return;
    info = r;
    toast(`The project is linked to ${label()}. Upload puts it into its attachments.`);
  }

  async function uploadFlow(force = false) {
    await flushSaves();
    onBusy("upload");
    try { await uploadOnce(force); } finally { onBusy(null); }
  }
  async function uploadOnce(force) {
    toast(`Uploading to ${label()}…`);
    const r = await api.plus4uUpload({ force });
    if (fail(r, "Upload failed")) return;
    if (r.conflict) {
      const ok = await askConfirm({ title: `The project in ${label()} was changed by someone else`, detail: `${r.conflict.name} was uploaded ${when(r.conflict.mts)}${r.conflict.uuIdentity ? ` by ${r.conflict.uuIdentity}` : ""} after your last sync. Uploading replaces it (the previous version stays in the history of the attachment). You can download it first instead.`, ok: "Replace it", danger: true });
      if (ok) await uploadOnce(true);
      return;
    }
    const n = r.uploaded.length;
    toast(n ? `Uploaded to ${label()}: ${r.uploaded.map((u) => u.name).join(", ")}.` : `Nothing to upload: ${label()} already has this version.`);
  }

  async function downloadFlow(force = false) {
    if (!force) {
      const ok = await askConfirm({ title: `Replace this project with the version in ${label()}?`, detail: "The screens and files of the project are replaced by the uploaded project. The current state is saved first as a zip in .studio/backups.", ok: "Download", danger: false });
      if (!ok) return;
    }
    await flushSaves();
    onBusy("download");
    let r;
    try { r = await api.plus4uDownload({ force }); } finally { onBusy(null); }
    if (fail(r, "Download failed")) return;
    if (r.missing) { toast(`${label()} has no uploaded version of this project yet.`, { err: true }); return; }
    if (r.conflict?.localChanged) {
      const ok = await askConfirm({ title: "The version in Plus4U is older than your project", detail: "Nobody uploaded since your last sync, but you changed the project since. Downloading would bring back the older version (your current state is saved to .studio/backups first).", ok: "Download anyway", danger: true });
      if (ok) await downloadFlow(true);
      return;
    }
    await reopen();
    toast(`Downloaded from ${label()} (${r.files.length} files). The previous state is in ${r.backup}.`);
  }

  async function unlink() {
    const ok = await askConfirm({ title: `Unlink the project from ${label()}?`, detail: "Nothing is deleted in Plus4U or here; the project only forgets the link.", ok: "Unlink", danger: false });
    if (!ok) return;
    if (!fail(await api.plus4uUnlink(), "Unlink failed")) { info = null; toast("The project is no longer linked to Plus4U."); }
  }

  /** The pages of a document (`url`, else the linked one); a missing sign-in of the document tools is offered once. { error } when it failed. */
  async function pagesWithLogin(url) {
    let r = await api.plus4uPages(url);
    if (r?.code === "login") {
      const ok = await askConfirm({ title: "Sign in to Plus4U for the documents?", detail: "Writing onto pages of a document goes through the uuManagementKit tools, which have a sign-in of their own: your browser opens the Plus4U sign-in.", ok: "Sign in", danger: false });
      if (!ok) return { error: "Not signed in to Plus4U for the documents." };
      const l = await api.plus4uDocsLogin(url);
      if (l?.error) return { error: `Sign-in failed: ${l.error}` };
      r = await api.plus4uPages(url);
    }
    if (r?.error) return { error: r.code === "territory" ? "Choose your Plus4U territory first (it is asked when you paste a document into the chat)." : r.error };
    return r;
  }

  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

  /**
   * Where to publish: { documentUrl, documentName, pageOid } or { …, newPageName }, or null (cancelled). The document comes first (the linked
   * one, those used before, or another one by its address), then its pages. `target` = where this item went last.
   */
  function pickTarget({ title, targets, suggestedName }) {
    return new Promise((resolve) => {
      const { linked, recent, target } = targets;
      const docs = [];
      if (linked) docs.push({ url: linked.url, name: linked.name || "Linked document", note: "linked to the project" });
      for (const d of recent) docs.push({ url: d.url, name: d.name || d.url, note: "used before" });
      if (target?.documentUrl && !docs.some((d) => d.url === target.documentUrl)) docs.push({ url: target.documentUrl, name: target.documentName || target.documentUrl, note: "used before" });

      const wrap = el("div", { className: "p4u-dlg" }), card = el("form", { className: "card" });
      const select = el("select", { className: "p4u-doc" });
      for (const d of docs) select.append(el("option", { value: d.url, textContent: `${d.name} · ${d.note}` }));
      select.append(el("option", { value: "__other", textContent: "Another document… (paste its address)" }));
      const other = el("div", { className: "p4u-other", hidden: true });
      const otherInput = el("input", { type: "text", placeholder: "https://uuapp.plus4u.net/uu-managementkit-maing02/…/document?oid=…" });
      const otherLoad = el("button", { type: "button", textContent: "Load pages" });
      other.append(otherInput, otherLoad);
      const status = el("p", { className: "mute p4u-status" });
      const list = el("div", { className: "p4u-pages" });
      const note = el("p", { className: "mute", textContent: "A new section is added to the chosen page; publishing again later overwrites that section." });
      const cancel = el("button", { type: "button", textContent: "Cancel" });
      const ok = el("button", { type: "submit", textContent: "Publish", className: "primary", disabled: true });
      card.append(el("h2", { textContent: title }), el("label", { className: "p4u-lab", textContent: "Document" }), select, other, el("label", { className: "p4u-lab", textContent: "Page" }), status, list, note, el("div", { className: "p4u-foot" }, cancel, ok));
      wrap.append(card); document.body.append(wrap);

      let current = null, seq = 0; // the loaded document: { documentUrl, documentName, pages, mainPageOid }
      async function load(url) {
        const my = ++seq;
        current = null; ok.disabled = true; list.replaceChildren(); status.textContent = "Loading the pages…";
        const r = await pagesWithLogin(url);
        if (my !== seq) return;
        if (r?.error) { status.textContent = r.error; return; }
        current = r; status.textContent = "";
        const previous = target?.documentUrl === r.documentUrl ? target.pageOid : null;
        const pick = previous && r.pages.some((p) => p.pageOid === previous) ? previous : "__new"; // never the main page by default: a careless Enter must not write into it
        const row = (value, text, extra) => {
          const radio = el("input", { type: "radio", name: "p4u-page", value, checked: value === pick });
          const l = el("label", {}, radio, el("span", { textContent: text }));
          if (extra) l.append(el("small", { textContent: extra }));
          list.append(l); return radio;
        };
        const newRadio = row("__new", "New page:");
        const name = el("input", { type: "text", value: suggestedName, className: "p4u-newname" });
        name.addEventListener("focus", () => { newRadio.checked = true; });
        newRadio.parentElement.append(name);
        for (const p of r.pages) row(p.pageOid, p.name || "(no name)", [p.pageOid === previous ? "published here before: it is overwritten" : "", p.hidden ? "hidden" : "", p.pageOid === r.mainPageOid ? "main page" : ""].filter(Boolean).join(" · "));
        ok.disabled = false;
        // a document typed in: it becomes a choice of the list (under its real name)
        if (![...select.options].some((o) => o.value === r.documentUrl)) select.insertBefore(el("option", { value: r.documentUrl, textContent: `${r.documentName || r.documentUrl} · new` }), select.querySelector("option[value=__other]"));
        select.value = r.documentUrl; other.hidden = true;
      }
      select.addEventListener("change", () => { if (select.value === "__other") { other.hidden = false; current = null; ok.disabled = true; list.replaceChildren(); status.textContent = "Paste the address of a document, keyTask or portal of uuManagementKit."; otherInput.focus(); } else load(select.value); });
      const loadOther = () => { const u = otherInput.value.trim(); if (u) load(u); };
      otherLoad.onclick = loadOther;
      otherInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); loadOther(); } });

      const close = (v) => { seq++; wrap.remove(); removeEventListener("keydown", esc, true); resolve(v); };
      const esc = (e) => { if (e.key === "Escape" && !document.querySelector("#confirm:not([hidden])")) { e.stopPropagation(); close(null); } };
      addEventListener("keydown", esc, true);
      cancel.onclick = () => close(null);
      wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(null); });
      card.onsubmit = (e) => {
        e.preventDefault();
        if (!current) return;
        const v = card.querySelector("input[name=p4u-page]:checked")?.value;
        const doc = { documentUrl: current.documentUrl, documentName: current.documentName ?? undefined };
        if (v === "__new") { const n = card.querySelector(".p4u-newname").value.trim(); if (!n) { card.querySelector(".p4u-newname").focus(); return; } close({ ...doc, newPageName: n }); }
        else if (v) close({ ...doc, pageOid: v });
      };

      const first = target?.documentUrl ?? linked?.url ?? docs[0]?.url;
      if (first) { select.value = first; load(first); } else { select.value = "__other"; select.dispatchEvent(new Event("change")); }
    });
  }

  /**
   * A new project from an existing document: its address, then what was uploaded to it (the projects of uu5Mock Studio, newest first) or an
   * empty project linked to it, and the name. { url, projectId | null, name } or null (cancelled). The project itself is made by the caller.
   */
  function pickDocumentProject() {
    return new Promise((resolve) => {
      const wrap = el("div", { className: "p4u-dlg" }), card = el("form", { className: "card" });
      const addr = el("div", { className: "p4u-other" });
      const input = el("input", { type: "text", placeholder: "https://uuapp.plus4u.net/uu-managementkit-maing02/…/document?oid=…" });
      const loadBtn = el("button", { type: "button", textContent: "Load" });
      addr.append(input, loadBtn);
      const status = el("p", { className: "mute p4u-status", textContent: "Paste the address of a document, keyTask or portal of uuManagementKit." });
      const list = el("div", { className: "p4u-pages", hidden: true });
      const nameLab = el("label", { className: "p4u-lab", textContent: "Project name", hidden: true });
      const name = el("input", { type: "text", className: "p4u-pname", hidden: true });
      const note = el("p", { className: "mute", hidden: true, textContent: "The project stays linked to the document: Upload and Download keep them in step." });
      const cancel = el("button", { type: "button", textContent: "Cancel" });
      const ok = el("button", { type: "submit", textContent: "Create project", className: "primary", disabled: true });
      card.append(el("h2", { textContent: "New project from a Plus4U document" }), el("label", { className: "p4u-lab", textContent: "Document" }), addr, status, list, nameLab, name, note, el("div", { className: "p4u-foot" }, cancel, ok));
      wrap.append(card); document.body.append(wrap);

      let current = null, seq = 0, typed = false;
      name.addEventListener("input", () => { typed = true; });
      const show = (on) => { for (const e of [list, nameLab, name, note]) e.hidden = !on; ok.disabled = !on; };
      async function load() {
        const url = input.value.trim(); if (!url) return input.focus();
        const my = ++seq; current = null; typed = false; show(false); list.replaceChildren(); status.textContent = "Reading the document…";
        const r = await api.plus4uDocProjects(url).catch((e) => ({ error: String(e?.message ?? e) }));
        if (my !== seq) return;
        if (!r || r.error) { status.textContent = /cancel/i.test(r?.error ?? "") ? "Sign in to Plus4U to read the document." : r?.error ?? "The document could not be read."; return; }
        if (!r.attachments) { status.textContent = `“${r.name ?? "The document"}” has no attachments, so a project cannot be kept there.`; return; }
        current = r;
        const docName = r.name || "Plus4U document";
        status.textContent = r.projects.length ? `“${docName}” has ${r.projects.length === 1 ? "an uploaded project" : `${r.projects.length} uploaded projects`}.` : `No project was uploaded to “${docName}” yet: the new project starts empty, linked to it.`;
        const nameFor = (v) => (v === "__empty" ? docName : r.projects.find((p) => p.projectId === v)?.projectName || docName);
        const row = (value, text, extra, checked) => {
          const radio = el("input", { type: "radio", name: "p4u-proj", value, checked });
          radio.addEventListener("change", () => { if (!typed) name.value = nameFor(value); });
          const l = el("label", {}, radio, el("span", { textContent: text }));
          if (extra) l.append(el("small", { textContent: extra }));
          list.append(l);
        };
        r.projects.forEach((p, i) => row(p.projectId, p.projectName || p.fileName || p.projectId, [p.mts ? `uploaded ${new Date(p.mts).toLocaleString()}` : "", i === 0 && r.projects.length > 1 ? "newest" : ""].filter(Boolean).join(" · "), i === 0));
        row("__empty", "Empty project", "only linked to the document", !r.projects.length);
        name.value = nameFor(r.projects[0]?.projectId ?? "__empty");
        show(true);
      }
      loadBtn.onclick = load;
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); load(); } });
      input.addEventListener("paste", () => setTimeout(load, 0)); // a pasted address is read at once

      const close = (v) => { seq++; wrap.remove(); removeEventListener("keydown", esc, true); resolve(v); };
      const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
      addEventListener("keydown", esc, true);
      cancel.onclick = () => close(null);
      wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(null); });
      card.onsubmit = (e) => {
        e.preventDefault();
        if (!current) return;
        const v = card.querySelector("input[name=p4u-proj]:checked")?.value;
        const n = name.value.trim(); if (!n) return name.focus();
        close({ url: current.url, projectId: v && v !== "__empty" ? v : null, name: n });
      };
      input.focus();
    });
  }

  /** Where an item went last ({ documentUrl, documentName, pageOid, pageName } or null): the Share menu offers a quick publish to it. */
  async function targetFor(file) { const r = await api.plus4uPublishTargets(file ? { screen: file } : { sitemap: true }).catch(() => null); return r && !r.error ? r.target : null; }
  /** Where the sitemap went last, or null (`targetFor(null)`). */
  const sitemapTarget = () => targetFor(null);

  /** Publishes a screen or the sitemap; `quick`: to where it went last, without the dialog (the dialog when it was never published). */
  async function publishFlow(kind, file = null, { quick = false, content: given = null } = {}) {
    const screen = kind === "screen" ? file ?? currentScreen() : null;
    let content;
    if (kind === "screen") {
      if (!screen) return toast("Select a screen first.", { err: true });
      const u = await screenUu5(screen);
      if (u?.error) return toast(u.error, { err: true });
      content = u.text;
    } else {
      content = given ?? sitemapUu5(); // the map as it is shown (folded branches) when it comes from its Share panel
      if (!content) return toast("There is no sitemap to publish.", { err: true });
    }
    const item = kind === "sitemap" ? { sitemap: true } : { screen };
    const what = kind === "sitemap" ? "the sitemap" : `“${screen.replace(/\.html$/, "")}”`;
    const targets = await api.plus4uPublishTargets(item);
    if (targets?.error) return toast(targets.error, { err: true });
    let choice;
    if (quick && targets.target) choice = { quick: true };
    else {
      choice = await pickTarget({ title: `Publish ${what}`, targets, suggestedName: kind === "sitemap" ? "Sitemap" : screen.replace(/\.html$/, "") });
      if (!choice) return;
    }
    toast(`Publishing ${what}…`);
    let r = await api.plus4uPublish({ ...item, content, ...choice });
    if (r?.code === "login") { // the document tools need their own sign-in
      const l = await pagesWithLogin(choice.documentUrl ?? targets.target?.documentUrl);
      if (l?.error) return toast(`Publishing failed: ${l.error}`, { err: true });
      r = await api.plus4uPublish({ ...item, content, ...choice });
    }
    if (r?.error) return toast(`Publishing failed: ${r.error}`, { err: true });
    const page = r.pageName ?? "the page", doc = r.documentName ? ` of “${r.documentName}”` : "";
    toast(r.created === false ? `${what} was updated on the page “${page}”${doc}.` : `${what} was published on ${r.created === "page" ? "the new page" : "the page"} “${page}”${doc}.`, { action: { label: "Open page", run: () => api.plus4uOpenPage(r.documentUrl, r.pageOid) } });
  }

  /** The items of the menu of the document chip in the toolbar (the link exists): [act, label] or null for a separator. */
  function chipItems() {
    const screen = currentScreen();
    return [
      ["p4u-open", "Open in Plus4U"],
      ...(screen ? [["p4u-publish-screen", `Publish “${screen.replace(/\.html$/, "")}” to a page…`]] : []),
      ...(sitemapUu5() ? [["p4u-publish-sitemap", "Publish the sitemap to a page…"]] : []),
      null,
      ["p4u-link", "Link another document…"],
      ["p4u-unlink", "Unlink"],
    ];
  }

  /** Runs a menu action (then tells `onChange`); false when the action is not one of these. */
  async function run(act) {
    if (act !== "p4u-link") await loadInfo();
    const done = await runAct(act);
    if (done) onChange();
    return done;
  }
  async function runAct(act) {
    if (act === "p4u-link") await link();
    else if (act === "p4u-publish-screen") await publishFlow("screen");
    else if (act === "p4u-publish-sitemap") await publishFlow("sitemap");
    else if (act === "p4u-upload") await uploadFlow();
    else if (act === "p4u-download") await downloadFlow();
    else if (act === "p4u-open") fail(await api.plus4uOpenArtifact(), "Opening failed");
    else if (act === "p4u-unlink") await unlink();
    else return false;
    return true;
  }

  /** Publishes one screen (the Share menu of that screen); `quick`: to where it went last. Then tells `onChange`. */
  async function publishScreen(file, { quick = false } = {}) { await loadInfo(); await publishFlow("screen", file, { quick }); onChange(); }

  /** Publishes the sitemap (its Share panel): `content` = its uu5string as shown; `quick`: to where it went last. */
  async function publishSitemap({ content = null, quick = false } = {}) { await loadInfo(); await publishFlow("sitemap", null, { quick, content }); onChange(); }

  return { menuItems, chipItems, run, publishScreen, publishSitemap, targetFor, sitemapTarget, pickDocumentProject };
}
