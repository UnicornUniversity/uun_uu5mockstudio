/**
 * Start from an existing component (Project → Git Repository, the dashboard, the Project menu): a component of the linked repository
 * (picked from its files) and what to do with it – extend / redesign it (its "as is" tree becomes the baseline) or make a NEW component
 * modelled on it (its tree is a reference for the structure, style and conventions) – plus, optionally, a screenshot of it.
 * From the dashboard there is no project yet: the repository is chosen here (the last one is offered) and `prepare({ repoPath })` makes the
 * project before the component is read. `api` = window.studio; `attach(files)` adds the pictures to the message; `onStart(result)` sends it.
 */
import { closeButton } from "./dialogChrome.js";
import { openRepoFilePicker } from "./repoFilePicker.js";
const h = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n; };

/** A component name from what the user typed: "course summary" → CourseSummary. */
export const pascal = (s) => String(s ?? "").replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase());

export function openComponentStart({ api, attach, onStart, prepare = null, toast = () => {}, mode: initialMode = "extend" }) {
  let busy = false, mode = initialMode, repo = null; // repo: { path, name } when started from the dashboard
  const shots = [];
  const file = h("input", { spellcheck: false, placeholder: "src/bricks/…/component.js" });
  const search = (q) => (prepare ? (repo ? api.repoFilesAt(repo.path, q) : Promise.resolve([])) : api.repoFiles(q));
  const pick = () => { if (prepare && !repo) return chooseRepo().then((ok) => ok && pick()); openRepoFilePicker({ anchor: file, host: ov, initial: file.value.trim(), search, onPick: (f) => { file.value = f; suggestName(); check(); } }); };
  const choose = h("button", { type: "button", className: "hod-browse", textContent: "Choose…", onclick: pick });
  file.onkeydown = (e) => { if (e.key === "ArrowDown") { e.preventDefault(); pick(); } else if (e.key === "Enter") { e.preventDefault(); go(); } };
  file.oninput = () => check();

  // the repository (dashboard only): the last one linked, or another one
  const repoName = h("b", { textContent: "—" }), repoInfo = h("small", { className: "mute" });
  const chooseRepo = async () => { const r = await api.repoPick().catch((e) => ({ error: String(e?.message ?? e) })); if (!r || r.canceled) return false; if (r.error) { err.textContent = r.error; return false; } setRepo(r); return true; };
  const setRepo = (r) => { repo = r; repoName.textContent = r ? r.name : "no repository chosen"; repoInfo.textContent = r ? `${r.path}${r.branch ? ` · ${r.branch}` : ""}` : "The repository where the component is."; check(); };
  const repoRow = prepare ? h("div", { className: "tsd-f" }, h("span", { textContent: "Repository" }), h("div", { className: "cs-repo" }, repoName, h("button", { type: "button", textContent: "Change…", onclick: chooseRepo })), repoInfo) : null;

  // what to do with it
  const modeSeg = h("span", { className: "hod-mode cs-mode", role: "radiogroup", "aria-label": "What to do with it" });
  for (const [m, label] of [["extend", "Extend or redesign it"], ["new", "New component based on it"]]) { const b = h("button", { type: "button", textContent: label, role: "radio" }); b.dataset.mode = m; b.onclick = () => { mode = m; paintMode(); }; modeSeg.append(b); }
  const name = h("input", { spellcheck: false, placeholder: "CourseSummary" });
  const desc = h("textarea", { rows: 2, placeholder: "What it should do, in a sentence or two" });
  let nameTouched = false; name.oninput = () => { nameTouched = true; check(); };
  const suggestName = () => { if (!nameTouched && mode === "new" && file.value.trim()) name.value = ""; };
  const newBox = h("div", { className: "cs-new" }, h("label", { className: "tsd-f" }, h("span", { textContent: "Name of the new component" }), name), h("label", { className: "tsd-f" }, h("span", { textContent: "What it should do" }), desc));
  const modeHelp = h("small", { className: "mute" });
  const paintMode = () => {
    for (const b of modeSeg.children) { const on = b.dataset.mode === mode; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
    newBox.hidden = mode !== "new";
    modeHelp.textContent = mode === "new" ? "The existing component is the pattern (structure, style, conventions); the new one is designed and handed over as new." : "Its decomposition as it is now becomes the baseline; the changes you make are handed over against it (modify, keep, remove, add).";
    start.textContent = mode === "new" ? "Design the new component" : "Build the screen";
    check();
  };

  // screenshots: added to the message when it is sent
  const shotInput = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
  const shotInfo = h("span", { className: "mute" });
  const paintShots = () => { shotInfo.textContent = shots.length ? `${shots.length} picture${shots.length === 1 ? "" : "s"} to attach` : "Optional: how the existing component looks in the real application. Paste (⌘V), drop here, or choose."; };
  const addShots = (files) => { for (const f of files) if (f.type.startsWith("image/")) shots.push(f); paintShots(); };
  shotInput.onchange = () => { addShots([...shotInput.files]); shotInput.value = ""; };
  const drop = h("div", { className: "cs-drop" }, h("button", { type: "button", textContent: "Add screenshot…", onclick: () => shotInput.click() }), shotInfo, shotInput);

  const err = h("p", { className: "tsd-err" });
  const go = async () => {
    if (busy || start.disabled) return;
    busy = true; start.disabled = true; err.textContent = "";
    const label = start.textContent; start.textContent = "Reading the component…";
    try {
      if (prepare) { const p = await prepare({ repoPath: repo.path }); if (!p || p.error) throw new Error(p?.error ?? "The project could not be made."); }
      if (shots.length) await attach(shots);
      const r = await api.componentStart(file.value.trim(), mode === "new" ? { mode: "new", name: pascal(name.value), description: desc.value } : { mode: "extend" });
      if (!r || r.error) throw new Error(r?.error ?? "The component could not be read.");
      close();
      toast(r.mode === "new" ? `${r.ref} is the reference for ${r.name} (${r.nodes} components from ${r.files.length} file${r.files.length === 1 ? "" : "s"}); the agent designs the screen ${r.screen}.` : `“${r.name} (as is)” is saved among the plans (${r.nodes} components from ${r.files.length} file${r.files.length === 1 ? "" : "s"}); the agent builds the screen ${r.screen}.`);
      onStart(r);
    } catch (e) { err.textContent = String(e?.message ?? e); start.textContent = label; } finally { busy = false; check(); }
  };
  const start = h("button", { type: "button", className: "primary", textContent: "Build the screen", onclick: go });
  const check = () => { start.disabled = busy || !file.value.trim() || (prepare && !repo) || (mode === "new" && !pascal(name.value)); };
  const close = () => ov.remove();
  const ov = h("div", { className: "tsdbox hodbox", onmousedown: (e) => { if (e.target === ov && !busy) close(); } },
    h("div", { className: "card", role: "dialog", "aria-label": "Start from an existing component" },
      h("div", { className: "dlg-head" }, h("h2", { textContent: "Start from an existing component" }), closeButton(() => { if (!busy) close(); })),
      h("div", { className: "tsd-body" },
        h("p", { className: "mute", textContent: "The agent reads the component and the files it imports – including providers, hooks and data loading – and builds a mockup screen to work on. Then you change it and hand it over." }),
        repoRow,
        h("label", { className: "tsd-f" }, h("span", { textContent: "Existing component (file in the repository)" }), h("div", { className: "hod-srcrow" }, file, choose)),
        h("div", { className: "tsd-f" }, h("span", { textContent: "What to do with it" }), modeSeg, modeHelp),
        newBox,
        h("div", { className: "tsd-f" }, h("span", { textContent: "Screenshot" }), drop),
        err),
      h("div", { className: "row" }, h("span", { className: "grow" }), h("button", { type: "button", textContent: "Cancel", onclick: () => { if (!busy) close(); } }), start)));
  ov.addEventListener("keydown", (e) => { if (e.key === "Escape" && !busy && !document.querySelector(".rfp")) { e.stopPropagation(); close(); } });
  ov.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files ?? [])]; if (f.length) { e.preventDefault(); addShots(f); } });
  drop.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types ?? [])].includes("Files")) { e.preventDefault(); drop.classList.add("on"); } });
  drop.addEventListener("dragleave", () => drop.classList.remove("on"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("on"); addShots([...e.dataTransfer.files]); });
  document.body.append(ov);
  paintShots(); paintMode();
  if (prepare) { setRepo(null); api.repoRecent().then((r) => { if (r && !r.error) setRepo(r); }).catch(() => {}); }
  file.focus();
  return { close };
}
