/**
 * Project → Git Repository → Hand Off for Production…: the approved plan (its components to build, with props, file and acceptance
 * criteria from the plan's tree), the branch feature/<name> of the linked repository and its base. "Create branch" commits the handoff
 * package there (main: handoff:create) without touching the checkout; then the developer gets the repository in VS Code and the command
 * with the task in plain words for the agent (Claude Code or Codex). `api` = window.studio.
 */
import { closeButton } from "./dialogChrome.js";
import { propsToText } from "./planTree.js";
import { openRepoFilePicker, wordsOf } from "./repoFilePicker.js";
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a component of the plan still lacks for the handover ("" when nothing). */
export function missingSpec(c) {
  if (c.mockOnly) return "";
  if ((c.source || (c.role && c.role !== "visual")) && !c.accept?.length) return "no acceptance criteria"; // a change keeps its props, a non-visual part may have none: only what should hold is needed
  if (c.source || (c.role && c.role !== "visual")) return "";
  const miss = [!c.props?.length && "props", !c.accept?.length && "acceptance criteria"].filter(Boolean);
  return miss.length ? `no ${miss.join(", no ")}` : "";
}

export function openHandoffDialog({ api, toast = () => {}, onLinkRepo = () => {}, onOpenPlan = () => {}, planSlug = null, screens = null }) {
  const only = screens?.length ? screens : null; // a handoff of some screens only (the selection bar, the menu of a screen)
  let info = null, busy = false;
  const body = h("div", { className: "tsd-body hod-body" });
  const create = h("button", { type: "button", className: "primary", textContent: "Create branch" });
  const cancel = h("button", { type: "button", textContent: "Cancel" });
  const err = h("p", { className: "tsd-err" });
  const close = () => ov.remove();
  cancel.onclick = close;
  const field = (label, input, hint) => h("label", { className: "tsd-f" }, h("span", { textContent: label }), input, hint ? h("small", { className: "mute", textContent: hint }) : null);

  async function load(slug) {
    info = await api.handoffInfo(slug, only).catch((e) => ({ error: String(e?.message ?? e) }));
    paint();
  }
  function paint() {
    body.replaceChildren(); err.textContent = "";
    if (!info || info.error) { err.textContent = info?.error ?? "The handoff could not be prepared."; create.disabled = true; body.append(err); return; }
    if (!info.repo || info.repo.error) {
      create.disabled = true;
      body.append(h("p", { textContent: info.repo?.error ? `The linked repository cannot be read: ${info.repo.error}` : "The handoff goes into a branch of the git repository where the real components are built. Link that repository first." }),
        h("div", {}, h("button", { type: "button", textContent: "Link Repository…", onclick: async () => { close(); await onLinkRepo(); } })));
      return;
    }
    create.disabled = !info.screens;
    // the plan and its components
    const slugFor = () => (info.mode === "screens" ? "@screens" : info.mode === "redesign" ? `@redesign:${info.redesign.slug}` : info.plan.slug);
    const planSel = h("select", {}, ...(info.baselines ?? []).map((b) => h("option", { value: `@redesign:${b.slug}`, textContent: `Redesign of ${b.name}: the screen against the component as it is`, selected: info.mode === "redesign" && info.redesign?.slug === b.slug })),
      ...info.plans.map((p) => h("option", { value: p.slug, textContent: `Plan: ${p.title}${p.status === "built" ? " (built)" : ""}${p.beforeBaseline ? " – made before the component was read" : ""}`, selected: info.mode === "plan" && p.slug === info.plan?.slug })),
      h("option", { value: "@screens", textContent: "The components of the screens (without a plan)", selected: info.mode === "screens" }));
    planSel.onchange = () => load(planSel.value);
    if (only) body.append(h("p", { className: "hod-only", textContent: `Only ${only.length === 1 ? `the screen ${only[0].replace(/\.html$/, "")}` : `${only.length} screens`} and ${only.length === 1 ? "its" : "their"} components are handed over; the other screens of the project stay out.` }));
    body.append(field("What to hand over", planSel, info.mode === "plan" ? "What the plan’s tree changes: new components (also non-visual ones), changed and removed ones of the existing code. Unchanged (keep) ones are context only." : info.mode === "redesign" ? `The screen compared with ${info.redesign.name} as it is in the repository (${info.redesign.file}): its parts are changed, kept or removed, what the screen adds is new. The mockup’s helpers are not built.` : "The components the mockups define themselves. Say for each whether it is new, a change of a component that already exists in the repository, or only for the mockup."));
    if (info.components.length) {
      const many = info.components.length > 2, heading = h("span");
      const paintHeading = () => { const b = info.components.filter((c) => !c.mockOnly && !c.remove && !c.keep), m = b.filter((c) => c.source).length, rm = info.components.filter((c) => c.remove).length; heading.textContent = `Components to build: ${b.length} of ${info.components.length}${m || rm ? ` (${b.length - m} new, ${m} changed${rm ? `, ${rm} removed` : ""})` : ""} – saved ${info.mode === "plan" ? "into the plan" : "with the project"}`; };
      const cards = info.components.map((c) => {
        const status = h("small");
        const target = h("input", { value: c.target ?? "", spellcheck: false, placeholder: "src/bricks/…/component.js (empty: the developer chooses)" });
        const listId = `hod-src-${c.name}`, sources = h("datalist", { id: listId }, ...(c.suggest ?? []).map((f) => h("option", { value: f })));
        const source = h("input", { value: c.source ?? "", spellcheck: false, placeholder: "src/bricks/…/existing-component.js" }); source.setAttribute("list", listId);
        const current = h("small", { className: "mute hod-cur" });
        const props = h("textarea", { value: propsToText(c.props), rows: Math.max(2, c.props.length + 1), spellcheck: false, placeholder: "title*: string — the header text\nonSelect: func — called with the item" });
        const accept = h("textarea", { value: c.accept.join("\n"), rows: Math.max(2, c.accept.length + 1), spellcheck: false, placeholder: "One acceptance criterion per line" });
        // the existing file: picked from the files of the repository (searchable list), or typed
        const browse = h("button", { type: "button", className: "hod-browse", textContent: "Choose…", title: "Choose the file from the repository" });
        const pickFile = () => openRepoFilePicker({ anchor: source, host: ov, initial: source.value.trim() || wordsOf(c.name), suggest: c.suggest ?? [], search: (q) => api.repoFiles(q), onPick: (f) => { source.value = f; save({ source: f }); } });
        browse.onclick = (e) => { e.preventDefault(); pickFile(); };
        source.onkeydown = (e) => { if (e.key === "ArrowDown" || (e.key === " " && e.ctrlKey)) { e.preventDefault(); pickFile(); } };
        const newBox = field("New file in the repository", target), modBox = h("div", {}, h("label", { className: "tsd-f" }, h("span", { textContent: "Existing component (file in the repository)" }), h("div", { className: "hod-srcrow" }, source, browse), h("small", { className: "mute", textContent: "The component this redesign changes: its current props are read from it." })), current, sources);
        const fields = h("div", { className: "hod-fields" }, newBox, modBox, field("Props", props, "One per line: name*: type = default — description (* = required). For a change: the props it should have."), field("Acceptance criteria", accept));
        // the mode: New (created), Modify (an existing component of the repository is changed), Mockup only (a helper of the mockup, not built)
        let mode = c.remove ? "remove" : c.keep ? "keep" : c.mockOnly ? "mock" : c.source ? "modify" : "new";
        const fromBaseline = info.mode === "redesign" && c.baseline; // a part of the existing component: Modify / Keep / Remove
        const seg = h("span", { className: "hod-mode", role: "radiogroup", "aria-label": `How ${c.name} is handed over` });
        const card = h("details", { className: "hod-comp", open: !many && !c.mockOnly });
        const paint = () => {
          card.classList.toggle("mock", mode === "mock"); card.classList.toggle("keep", mode === "keep"); card.classList.toggle("rm", mode === "remove"); seg.hidden = mode === "remove" && !fromBaseline; fields.hidden = mode === "mock" || mode === "remove" || mode === "keep"; newBox.hidden = mode !== "new"; modBox.hidden = mode !== "modify";
          for (const b of seg.children) { const on = b.dataset.mode === mode; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
          const miss = missingSpec(c), d = c.diff;
          current.textContent = mode !== "modify" ? "" : !c.source ? (c.suggest?.length ? "Choose the file: files with a matching name are offered first." : "Choose the file from the repository (Choose…).") : c.sourceMissing ? "This file is not in the repository: check the path." : `It declares ${c.current?.length ? c.current.map((p) => p.name).join(", ") : "no propTypes"}.${d ? ` The redesign ${[d.added.length && `adds ${d.added.map((p) => p.name).join(", ")}`, d.changed.length && `changes ${d.changed.map((x) => x.name).join(", ")}`, d.removed.length && `removes ${d.removed.map((p) => p.name).join(", ")}`].filter(Boolean).join(", ") || "keeps the props"}.` : ""}`;
          current.className = c.sourceMissing && mode === "modify" ? "hod-miss hod-cur" : "mute hod-cur";
          if (mode === "keep") { status.textContent = `stays as it is${c.source ? ` (${c.source.split("/").pop()})` : ""} – context only`; status.className = "mute"; paintHeading(); return; }
          if (mode === "remove") { status.textContent = `removed by the redesign${c.source ? ` (${c.source.split("/").pop()})` : ""}`; status.className = "hod-miss"; paintHeading(); return; }
          status.textContent = mode === "mock" ? (c.guessed ? "only for the mockup (guessed) – not built" : "only for the mockup – not built") : mode === "modify" ? (c.source ? `changes ${c.source.split("/").pop()}${c.why ? ` (${c.why})` : ""}${miss ? ` · ${miss}` : ""}` : "pick the existing file") : miss || "new · ready";
          status.className = mode === "mock" ? "mute" : miss || (mode === "modify" && (!c.source || c.sourceMissing)) ? "hod-miss" : "hod-ok";
          paintHeading();
        };
        const save = async (spec) => {
          const r = await api.handoffSaveSpec(slugFor(), c.name, spec).catch((e) => ({ error: String(e?.message ?? e) }));
          if (!r || r.error) { err.textContent = r?.error ?? "It could not be saved."; return; }
          for (const k of ["target", "source", "current", "diff", "sourceMissing", "suggest"]) delete c[k];
          Object.assign(c, r);
          props.value = propsToText(r.props); accept.value = r.accept.join("\n"); target.value = r.target ?? ""; source.value = r.source ?? "";
          if (r.suggest) sources.replaceChildren(...r.suggest.map((f) => h("option", { value: f })));
          mode = r.remove ? "remove" : r.keep ? "keep" : r.mockOnly ? "mock" : mode === "modify" || r.source ? "modify" : "new"; paint();
        };
        const MODES = fromBaseline ? [["modify", "Modify"], ["keep", "Keep"], ["remove", "Remove"]] : [["new", "New"], ["modify", "Modify existing"], ["mock", "Mockup only"]];
        for (const [m, label] of MODES) seg.append(Object.assign(h("button", { type: "button", textContent: label, role: "radio" }), { onclick: (e) => {
          e.preventDefault(); e.stopPropagation(); // inside the summary: no open / close of the card
          if (m === mode) return;
          const was = mode; mode = m; card.open = m !== "mock"; paint();
          if (fromBaseline) save({ keep: m === "keep", remove: m === "remove" });
          else if (m === "mock") save({ mockOnly: true });
          else if (m === "new") save({ mockOnly: false, source: "" });
          else { const pick = c.source || c.suggest?.[0] || ""; save({ mockOnly: false, ...(pick ? { source: pick } : {}) }); if (!pick) setTimeout(pickFile, 0); } // nothing matches the name: the list of the repository's files opens
          void was;
        } }));
        [...seg.children].forEach((b, i) => { b.dataset.mode = MODES[i][0]; });
        target.onchange = () => save({ target: target.value });
        source.onchange = () => save({ source: source.value });
        source.oninput = async () => { const q = source.value.trim(); if (q.length < 2) return; const f = await api.repoFiles(q).catch(() => []); sources.replaceChildren(...[...new Set([...(c.suggest ?? []), ...f])].slice(0, 30).map((x) => h("option", { value: x }))); };
        props.onchange = () => save({ props: props.value });
        accept.onchange = () => save({ accept: accept.value });
        const roleTag = c.role && c.role !== "visual" ? h("span", { className: "hod-role", textContent: { component: "logic", data: "data", provider: "provider", context: "context", hook: "hook" }[c.role] ?? c.role, title: "Not visual: built without a mockup" }) : null;
        card.append(h("summary", {}, seg, mode === "remove" ? h("span", { className: "hod-rmtag", textContent: "Remove" }) : null, roleTag, h("b", { textContent: c.name }), c.note ? h("span", { className: "mute", textContent: ` – ${c.note}` }) : null, c.screens?.length ? h("span", { className: "mute", textContent: ` · ${c.screens.map((f) => f.replace(/\.html$/, "")).join(", ")}` }) : null, " ", status), fields);
        paint();
        return card;
      });
      paintHeading();
      // the mockup's helpers at the end, folded: they are listed (the switch can change it) but not in the way
      const helpers = cards.filter((_, i) => info.components[i].mockOnly), main = cards.filter((_, i) => !info.components[i].mockOnly);
      const group = helpers.length ? h("details", { className: "hod-helpers" }, h("summary", { textContent: `Only for the mockup, not built (${helpers.length}): ${info.components.filter((c) => c.mockOnly).map((c) => c.name).join(", ")}` }), ...helpers) : null;
      body.append(h("div", { className: "tsd-f" }, heading, h("div", { className: "hod-comps" }, ...main, group)));
    } else if (info.mode === "plan") body.append(h("p", { className: "tsd-warn" }, "No component in this plan’s tree is of kind “new”: mark the components to build as new in the plan, or hand over the components of the screens. ", h("button", { type: "button", className: "linkish", textContent: "Open the plan", onclick: () => { close(); onOpenPlan(info.plan.slug); } })));
    else body.append(h("p", { className: "tsd-warn", textContent: "The screens define no component of their own: the package holds the screens and the specification." }));
    // the branch
    const branch = h("input", { value: info.branch, spellcheck: false });
    // where the branch starts: local branches and those of the remote; by default the one the agent read the code from
    const base = h("select");
    const fillBases = (list, keep) => {
      const group = (label, items) => (items.length ? h("optgroup", { label }, ...items.map((b) => h("option", { value: b.name, textContent: `${b.name}${b.name === info.readFrom ? " (read by the agent)" : b.name === info.current ? " (checked out)" : ""}`, title: b.name === info.readFrom ? "The agent read the code of this branch while designing" : b.name === info.current ? "Checked out in your working copy" : "", selected: b.name === keep }))) : null);
      base.replaceChildren(...[group("Local", list.filter((b) => !b.remote)), group("Remote", list.filter((b) => b.remote))].filter(Boolean));
      if (keep && [...base.options].some((o) => o.value === keep)) base.value = keep;
    };
    fillBases(info.bases, info.base);
    const fetchBtn = h("button", { type: "button", className: "hod-fetch", textContent: "Fetch", title: "git fetch: bring the branches of the remote up to date" });
    const baseNote = h("small", { className: "mute" });
    const paintBase = async () => {
      const st = base.disabled ? null : await api.handoffBaseStatus(base.value).catch(() => null);
      baseNote.className = st?.behind ? "hod-miss" : "mute";
      baseNote.textContent = st?.behind ? `${base.value} is ${plural(st.behind, "commit")} behind ${st.upstream}: choose ${st.upstream}, or bring ${base.value} up to date first.` : st?.upstream ? `Up to date with ${st.upstream} as far as the last fetch knows.` : base.value?.includes("/") ? "A branch of the remote: the new branch starts from its last fetched commit." : "";
    };
    fetchBtn.onclick = async () => {
      fetchBtn.disabled = true; fetchBtn.textContent = "Fetching…";
      const r = await api.handoffFetch().catch((e) => ({ error: String(e?.message ?? e) }));
      fetchBtn.disabled = false; fetchBtn.textContent = "Fetch";
      if (r?.error) { err.textContent = r.error; return; }
      if (!r.remotes?.length) { baseNote.textContent = "The repository has no remote."; return; }
      fillBases(r.bases, base.value); toast("The branches of the remote are up to date."); paintBase();
    };
    const note = h("small", { className: "mute" });
    const check = async () => {
      const b = branch.value.trim(); if (!b) { note.textContent = ""; create.disabled = true; return; }
      const st = await api.handoffBranchInfo(b).catch(() => null);
      const mainLine = /^(main|master|develop|development|trunk|release([/-].*)?)$/.test(branch.value.trim()); create.disabled = Boolean(st?.checkedOutIn && mainLine) || !info.screens;
      base.disabled = Boolean(st?.exists);
      note.textContent = st?.checkedOutIn ? (mainLine ? `${branch.value.trim()} is checked out in ${st.checkedOutIn}: a handoff goes onto a feature branch.` : `The branch is checked out in ${st.checkedOutIn}: the package is committed there as a new commit (only its own files; your other changes stay).`) : st?.exists ? "The branch exists: the handoff is added to it as a new commit." : `A new branch from the last commit of ${base.value || "the current branch"} (uncommitted changes are not in it). Your working copy is not touched.`;
      base.disabled = Boolean(st?.exists); fetchBtn.disabled = Boolean(st?.exists);
      create.textContent = st?.exists ? "Update branch" : "Create branch";
    };
    branch.oninput = check; base.onchange = () => { check(); paintBase(); };
    body.append(h("div", { className: "tsd-row" }, field("Branch", branch), h("label", { className: "tsd-f" }, h("span", { textContent: "From" }), h("div", { className: "hod-srcrow" }, base, fetchBtn), baseNote)), note);
    paintBase();
    if (info.last) {
      const d = info.last.drift, n = d.changed.length + d.added.length + d.removed.length;
      body.append(h("p", { className: n ? "tsd-warn" : "mute", textContent: `Last handed over ${new Date(info.last.at).toLocaleString()} to ${info.last.branch} (${info.last.commit.slice(0, 7)}). ${n ? `Since then: ${[d.changed.length && `${plural(d.changed.length, "screen")} changed`, d.added.length && `${d.added.length} new`, d.removed.length && `${d.removed.length} removed`].filter(Boolean).join(", ")}.` : "No screen has changed since."}` }));
    }
    body.append(h("p", { className: "mute hod-what", textContent: `The branch gets ${HANDOFF_DIR}/${info.slug}/ (HANDOFF.md, BUILD.md, handoff.json, ${plural(info.screens, "mockup")} with pictures, the project’s description and rules) and the task for the agent (PROMPT.md).` }), err);
    create.onclick = () => run({ only, planSlug: info.mode === "plan" ? info.plan?.slug ?? null : slugFor(), branch: branch.value.trim(), base: base.disabled ? null : base.value || null });
    check();
  }
  async function run(o) {
    if (busy) return;
    busy = true; create.disabled = true; cancel.disabled = true; err.textContent = "";
    create.textContent = "Rendering the screens and committing…";
    const r = await api.handoffCreate(o).catch((e) => ({ error: String(e?.message ?? e) }));
    busy = false; cancel.disabled = false;
    if (!r || r.error) { err.textContent = r?.error ?? "The handoff failed."; create.disabled = false; create.textContent = "Try again"; return; }
    done(r);
  }
  /**
   * After the branch is made: how the components get built. Step 1 prepares a folder with the branch (a worktree next to the repository: the
   * working copy is not switched); step 2 says what to do in the tool the user has – VS Code (with Claude Code or Codex), the Claude app, a terminal.
   */
  function done(r) {
    const copy = (text, what) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied.`), () => toast("Could not copy.", { err: true }));
    // the task for the agent, readable in full and copied in one click (the same for Claude Code and Codex)
    const task = () => h("div", { className: "hod-task" }, h("pre", { textContent: r.prompt }), h("button", { type: "button", className: "primary", textContent: "Copy the task", onclick: () => copy(r.prompt, "The task") }));
    const line = (label, text, what = label) => h("div", { className: "hod-cmd" }, h("span", { textContent: label }), h("code", { textContent: text, title: text }), h("button", { type: "button", textContent: "Copy", onclick: () => copy(text, what) }));
    let ws = null, wc = null, place = "here", worked = null; // ws: { path, commands } where the branch is; wc: the working copy's state; worked: "switched" | "folder"
    const where = h("p", { className: "mute hod-where" });
    const prep = h("button", { type: "button", className: "primary" });
    const placeSeg = h("span", { className: "hod-mode hod-place", role: "radiogroup", "aria-label": "Where to work" });
    for (const [k, label] of [["here", "In my working copy"], ["side", "In a separate folder"]]) { const b = h("button", { type: "button", textContent: label, role: "radio" }); b.dataset.place = k; b.onclick = () => { place = k; paint(); }; placeSeg.append(b); }
    const endNote = h("p", { className: "mute" });
    const steps = h("div", { className: "hod-steps" });
    const tabsBox = h("span", { className: "hod-mode hod-tabs", role: "tablist" });
    // only the tools on this computer (handoff:tools): the Claude / Codex apps, their CLIs, VS Code with their extensions
    let tab = "vscode", tools = null;
    const LABELS = { vscode: "VS Code", app: "Claude app", codex: "Codex", terminal: "Terminal", task: "Task" };
    const setTabs = (list) => {
      tabsBox.replaceChildren(...list.map((k) => { const b = h("button", { type: "button", textContent: LABELS[k], role: "tab" }); b.dataset.tab = k; b.onclick = () => { tab = k; paint(); }; return b; }));
      tabsBox.hidden = list.length < 2; if (!list.includes(tab)) tab = list[0];
    };
    setTabs(["vscode", "app", "codex", "terminal"]);
    const agentsIn = () => { const c = tools ? tools.vscodeClaude || (!tools.vscodeCodex && tools.claudeCli) : true, x = tools ? tools.vscodeCodex || (!tools.vscodeClaude && tools.codexCli) : true; return c && x ? "the Claude Code panel (or Codex)" : x ? "the Codex panel" : "the Claude Code panel"; };
    const reveal = () => api.handoffReveal(ws.path).catch(() => null);
    function paint() {
      for (const b of tabsBox.children) { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); }
      for (const b of placeSeg.children) { const on = b.dataset.place === place; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
      placeSeg.hidden = !wc || Boolean(ws) || wc.here || Boolean(wc.elsewhere);
      prep.hidden = !wc || Boolean(ws);
      prep.textContent = place === "here" ? "Switch to the branch" : "Prepare the folder";
      prep.disabled = place === "here" && Boolean(wc?.dirty);
      const pathBits = () => [h("code", { textContent: ws.path }), " ", h("button", { type: "button", className: "linkish", textContent: "Show", onclick: reveal }), h("button", { type: "button", className: "linkish", textContent: "Copy path", onclick: () => copy(ws.path, "The path") })];
      if (!wc) where.replaceChildren("Looking at your working copy…");
      else if (ws) where.replaceChildren(h("span", { textContent: worked === "folder" || wc.elsewhere ? `The branch ${r.branch} is in a separate folder: ` : `Your working copy is on ${r.branch}: ` }), ...pathBits());
      else if (place === "here") where.replaceChildren(...(wc.dirty
        ? [h("span", { className: "hod-need", textContent: `Your working copy has ${plural(wc.dirty, "changed file")} on ${wc.current}. Commit or stash them first, or work in a separate folder.` })]
        : [h("span", { textContent: `Your project folder switches from ${wc.current} to ${r.branch} (git switch). Switch back any time.` })]));
      else where.replaceChildren(h("span", { textContent: "A folder next to your repository with this branch checked out (git worktree): your working copy stays as it is. It needs its own npm install before lint and tests run." }));
      endNote.textContent = `Nothing was pushed: push the branch or open a pull request when it is ready.${worked === "switched" && wc?.current && wc.current !== r.branch ? ` Back to your branch: git switch ${wc.current}.` : ""}${worked === "folder" || wc?.elsewhere ? " When you are done, the folder can be removed (git worktree remove)." : ""}`;
      const need = !ws ? h("p", { className: "hod-need", textContent: place === "here" ? "First switch to the branch (step 1)." : "First prepare the folder (step 1)." }) : null;
      if (tab === "vscode") steps.replaceChildren(
        h("p", {}, h("b", { textContent: "a) " }), "Open the folder in VS Code", ws ? " " : "", ws ? h("button", { type: "button", textContent: "Open in VS Code", onclick: async () => { const x = await api.handoffOpenEditor(ws.path).catch((e) => ({ error: String(e?.message ?? e) })); if (x?.error) toast(x.error, { err: true }); } }) : need),
        h("p", {}, h("b", { textContent: "b) " }), `Open ${agentsIn()} there and send this task:`),
        task());
      else if (tab === "app") steps.replaceChildren(
        h("p", {}, h("b", { textContent: "a) " }), "In the Claude app open Code and start a new session in that folder", ws ? " " : "", ws ? h("button", { type: "button", className: "linkish", textContent: "Copy path", onclick: () => copy(ws.path, "The path") }) : need),
        h("p", {}, h("b", { textContent: "b) " }), "Send this task:"),
        task());
      else if (tab === "codex") steps.replaceChildren(
        h("p", {}, h("b", { textContent: "a) " }), "In the Codex app add that folder as a project and start a new local task in it", ws ? " " : "", ws ? h("button", { type: "button", className: "linkish", textContent: "Copy path", onclick: () => copy(ws.path, "The path") }) : need),
        h("p", {}, h("b", { textContent: "b) " }), "Send this task:"),
        task());
      else if (tab === "terminal") {
        const cmds = [tools?.claudeCli !== false && ["Claude Code", ws?.commands.claude], tools?.codexCli !== false && ["Codex", ws?.commands.codex]].filter(Boolean);
        steps.replaceChildren(...(ws ? [h("p", { textContent: cmds.length > 1 ? "Run one of them (the agent starts with the task):" : "Run it (the agent starts with the task):" }), ...cmds.map(([l, c]) => line(l, c, "The command"))] : [need]));
      } else steps.replaceChildren( // no coding agent found on this computer: the folder and the task, for whatever the developer uses
        h("p", {}, h("b", { textContent: "a) " }), "Open that folder in your coding agent", ws ? " " : "", ws ? h("button", { type: "button", className: "linkish", textContent: "Copy path", onclick: () => copy(ws.path, "The path") }) : need),
        h("p", {}, h("b", { textContent: "b) " }), "Send this task:"),
        task(),
        h("p", { className: "mute", textContent: "Neither Claude Code nor Codex was found on this computer." }));
    }
    prep.onclick = async () => {
      const label = prep.textContent; prep.disabled = true; prep.textContent = place === "here" ? "Switching…" : "Preparing…";
      const x = await (place === "here" ? api.handoffSwitch(r.branch, r.prompt) : api.handoffWorkspace(r.branch, r.slug, r.prompt)).catch((e) => ({ error: String(e?.message ?? e) }));
      prep.disabled = false; prep.textContent = label;
      if (!x || x.error) { toast(x?.error ?? "That did not work.", { err: true }); return; }
      ws = x; worked = place === "here" ? "switched" : "folder"; paint();
      if (x.repo) window.dispatchEvent(new CustomEvent("studio:repo", { detail: x.repo })); // the working copy is on another branch now
    };
    api.handoffTools?.().then((t) => { if (!t || t.error) return; tools = t; setTabs(t.tabs); paint(); }).catch(() => {});
    api.handoffWorkingCopy(r.branch, r.prompt).then((s) => {
      wc = s && !s.error ? s : { dirty: 0, current: "", here: false, elsewhere: null };
      if (wc.here) ws = { path: wc.path, commands: wc.commands }; // already on the branch: nothing to do
      else if (wc.elsewhere) ws = { path: wc.elsewhere, commands: wc.elsewhereCommands }; // a folder made earlier
      place = wc.dirty ? "side" : "here"; paint();
    }, () => { wc = { dirty: 0, current: "", here: false, elsewhere: null }; place = "side"; paint(); });
    body.replaceChildren(
      h("p", {}, h("b", { textContent: r.changed ? `${r.created ? "Branch created" : "Branch updated"}: ${r.branch}` : `Nothing changed on ${r.branch}` }), h("span", { className: "mute", textContent: ` · commit ${r.commit.slice(0, 7)} · ${plural(r.files, "file")}, ${plural(r.pictures, "picture")} of screens` })),
      h("p", { textContent: "Now let an agent build the components from it (it reads BUILD.md and uses the uu5-development and uuGDS skills):" }),
      h("div", { className: "hod-step" }, h("span", { className: "hod-num", textContent: "1" }), h("div", {}, h("b", { textContent: "Where to work on the branch" }), placeSeg, where, prep)),
      h("div", { className: "hod-step" }, h("span", { className: "hod-num", textContent: "2" }), h("div", {}, h("b", { textContent: "Build it in your tool" }), tabsBox, steps)),
      endNote);
    paint();
    foot.replaceChildren(); foot.hidden = true; // the × of the head closes it: no second Close
    prep.focus();
  }

  const foot = h("div", { className: "row" }, h("span", { className: "grow" }), cancel, create);
  const ov = h("div", { className: "tsdbox hodbox", onmousedown: (e) => { if (e.target === ov && !busy) close(); } },
    h("div", { className: "card", role: "dialog", "aria-label": "Hand off for production" },
      h("div", { className: "dlg-head" }, h("h2", { textContent: only ? `Hand off for production: ${only.map((f) => f.replace(/\.html$/, "")).join(", ")}` : "Hand off for production" }), closeButton(() => { if (!busy) close(); })),
      body, foot));
  ov.addEventListener("keydown", (e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); close(); } });
  document.body.append(ov);
  body.append(h("p", { className: "mute", textContent: "Reading the project…" }));
  load(planSlug);
}
const HANDOFF_DIR = ".uu5mock/handoff";
