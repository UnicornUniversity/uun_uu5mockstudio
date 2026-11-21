import { createCanvas, DEVICES } from "./canvas.js";
import { createInspector, describePick, updateSelection, MAX_MARKED } from "./inspector.js";
import { annotationKey, annotationsContext, describeAnnotation, historyOf, captureRect, renumbering, renumberText, MAX_ANNOTATIONS, MAP_WHOLE } from "./annotations.js";
import { createAnnotatePopover } from "./annotatePopover.js";
import { createPropsPanel } from "./propsPanel.js";
import { createIconPicker } from "./iconPicker.js";
import { createMemory } from "./memory.js";
import { createRulesPanel } from "./rulesPanel.js";
import { createBrandDialog, isBrandFile } from "./brandDialog.js";
import { createDescPanel } from "./descPanel.js";
import { createFsNote } from "./fsnote.js";
import { createSetup } from "./setup.js";
import { createTour } from "./tour.js";
import { createRoleDialog } from "./roleDialog.js";
import { createImageGenDialog } from "./imageGenDialog.js";
import { createSettingsDialog } from "./settingsDialog.js";
import { openHandoffDialog } from "./handoffDialog.js";
import { openComponentStart } from "./componentStartDialog.js";
import { createGuideDialog } from "./guideDialog.js";
import { createCommentsPanel } from "./commentsPanel.js";
import { COMMENTS } from "./features.js";
import { createFlowLayer } from "./flowLayer.js";
import { createVariantLayer, groupVariants } from "./variantLayer.js";
import { createVariantsDialog } from "./variantsDialog.js";
import { buildVariantsPrompt, variantNames, variantInfo } from "./variants.js";
import { buildGuidePrompt, guideTemplate } from "./guide.js";
import { roleOf, planFirst, isRole } from "./role.js";
import { createLibraryPicker } from "./libraryPicker.js";
import { createCatalogDrag } from "./catalogDrag.js";
import { listKind, newAction } from "./actionGrammar.js";
import { attachFreeze } from "./freeze.js";
import { usageDelta, usageLabel, usageTitle, isBigRequest, CONTEXT_WARN, formatTokens } from "./usage.js";
import { createTemplatesDialog } from "./templatesDialog.js";
import { openTemplateSave } from "./templateSaveDialog.js";
import { openFrameDialog } from "./frameDialog.js";
import { createDashboard, LEVEL_KEY, newProjectName, projectNameFromScreen, projectNameFromTitle } from "./dashboard.js";
import { createActionListEditor } from "./actionListEditor.js";
import { renderPlan } from "./planView.js";
import { createStructureDialog } from "./structureDialog.js";
import { createPlanCards } from "./planCards.js";
import { createPlansMenu } from "./plansMenu.js";
import { providerOf, windowsFor, resetText, levelOf } from "./limits.js";
import { parsePlan, serializePlan, slugify, withStatus } from "./planDoc.js";
import { reviseMessage, takeComments, serializeSitemap, extractSitemap, normalizeSitemap, countScreens, kindOf, countBuilt, sitemapFromScreens, sitemapSvg, sitemapUu5String, sitemapOffered } from "./sitemap.js";
import { extractPlan, approvalMessage, answersText, serializeTree, regenerateMessage, normalizeTree } from "./planTree.js";
import { esc, markdown } from "./markdown.js";
import { createChatDock } from "./chatdock.js";
import { flashCode } from "./flashComponent.js";
import { collectCode } from "./uu5StringCollect.js";
import { toUu5String, mergeTrees, summaryOf } from "./uu5String.js";
import { createDocCards, docsContext, territoryDialog } from "./docCards.js";
import { kindLabel } from "./docLinks.js";
import { openSitePicker } from "./sitePicker.js";
import { structureContext } from "./siteStructure.js";
import { addDialogClose, escapeTarget } from "./dialogChrome.js";
import { createAccountButton } from "./accountButton.js";
import { createPlus4uSync } from "./plus4uSync.js";
import { createPlus4uBar, ICONS } from "./plus4uBar.js";

const $ = (id) => document.getElementById(id);

const log = $("log");
const NO_AI = "Chat is not available: neither Claude Code nor Codex is installed and signed in (see Help)."; // the rest of the app works without it
let port, webviewPreload = "", chatId = null, chatList = [], project = "", projectList = [], loading = false, ready = false, busy = false, setup = null;
/** Persisted chat: {kind:"user"|"ai"|"err"|"note", text} | {kind:"steps", steps:[{id,label,status}]} */
let entries = [];

log.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-href]"); if (a) window.studio.openExternal(a.dataset.href);
  const m = e.target.closest("a.mention"); if (m) canvas.focus(m.dataset.screen);
});

// ---------- chat rendering ----------
const TOOL_LABELS = {
  Skill: (i) => `Skill ${i.skill ?? ""}`, Read: (i) => `Reading ${base(i.file_path)}`, Write: (i) => `Writing ${base(i.file_path)}`,
  Shell: (i) => `Running ${String(i.command ?? "").replace(/^\/bin\/(?:zsh|bash|sh) -lc /, "").slice(0, 70)}`, Edit: (i) => `Editing ${base(i.file_path)}`, MultiEdit: (i) => `Editing ${base(i.file_path)}`, Glob: () => "Searching files", Grep: () => "Searching file contents",
"mcp__studio-browser__browser_open": (i) => `Preview: opening ${i.file ?? ""}`,
  "mcp__studio-browser__browser_reload": () => "Preview: reload and check", "mcp__studio-browser__browser_console": () => "Preview: reading console",
  "mcp__studio-browser__browser_snapshot": () => "Preview: snapshot", "mcp__studio-browser__browser_screenshot": () => "Preview: screenshot",
};
const base = (p) => (p ?? "").split("/").pop();
const labelOf = (b) => (TOOL_LABELS[b.name]?.(b.input ?? {}) ?? b.name).trim();

function entryEl(e) {
  if (e.kind === "steps") {
    const d = document.createElement("details"); d.className = "steps";
    const running = e.steps.find((s) => s.status === "run");
    d.open = d.dataset.open === "1";
    d.innerHTML = `<summary><span class="st ${running ? "run" : "ok"}"></span>${running ? esc(running.label) : `${e.steps.length} ${e.steps.length === 1 ? "step" : "steps"}`}</summary><ul>${
      e.steps.map((s) => `<li><span class="st ${s.status}"></span> ${esc(s.label)}</li>`).join("")}</ul>`;
    return d;
  }
  if (e.kind === "plan") return renderPlan(e, planCtx);
  if (e.kind === "exceptions") { // where a screen made from code differs from its library components (stand-ins, equivalents, others)
    const d = Object.assign(document.createElement("div"), { className: "msg exceptions" });
    d.append(Object.assign(document.createElement("b"), { textContent: `Exceptions to ${e.origin} · ${e.file.replace(/\.html$/, "")}` }));
    const ul = document.createElement("ul"); for (const l of e.lines) ul.append(Object.assign(document.createElement("li"), { textContent: l })); d.append(ul);
    return d;
  }
  if (e.kind === "usage") { // the tokens of one request, under its answer
    const big = isBigRequest(e), u = Object.assign(document.createElement("div"), { className: big ? "usage big" : "usage", textContent: usageLabel(e), title: usageTitle(e) });
    if (big) u.append(Object.assign(document.createElement("span"), { className: "usage-hint", textContent: " · a large request: a new conversation is cheaper" })); // shown in the simple view, where the other token lines are hidden
    return u;
  }
  const el = document.createElement("div");
  el.className = `msg ${e.kind === "note" ? "note" : e.kind === "err" ? "err" : e.kind}`;
  if (e.kind === "ai" && e.planning) { el.classList.add("planning"); el.textContent = "Preparing the plan…"; } // the answer in Plan mode is shown once, as the finished plan
  else if (e.kind === "ai") el.innerHTML = markdown(e.text);
  else if (e.kind === "user") {
    el.innerHTML = highlightMentions(e.text);
    if (e.images?.length) { const row = Object.assign(document.createElement("div"), { className: "atts" }); for (const im of e.images) row.append(Object.assign(document.createElement("img"), { src: im.thumb, alt: im.name ?? "attachment", title: im.name ?? "" })); el.append(row); }
    if (e.annotations?.length) {
      const ol = Object.assign(document.createElement("ol"), { className: "annos" });
      for (const a of e.annotations) {
        const li = Object.assign(document.createElement("li"), { title: a.label });
        li.append(Object.assign(document.createElement("b"), { className: "anno-n", textContent: String(a.ref) }));
        if (a.thumb) li.append(Object.assign(document.createElement("img"), { src: a.thumb, alt: "" }));
        const body = Object.assign(document.createElement("span"), { className: "anno-body" });
        body.append(Object.assign(document.createElement("span"), { className: `anno-note${a.note ? "" : " link"}`, textContent: a.note ?? `[#${a.ref}] in the text` }), Object.assign(document.createElement("span"), { className: "anno-what", textContent: `${a.kind === "sitemap" ? "🗺 " : ""}${a.label}` }));
        li.append(body); ol.append(li);
      }
      el.append(ol);
    }
    if (e.docs?.length) { const row = Object.assign(document.createElement("div"), { className: "atts docs" }); for (const d of e.docs) { if (d.thumb) row.append(Object.assign(document.createElement("img"), { src: d.thumb, alt: d.title, title: `${kindLabel(d.kind)}: ${d.title}` })); row.append(Object.assign(document.createElement("button"), { type: "button", className: "docchip", textContent: `📄 ${d.title}`, title: `${kindLabel(d.kind)}: ${d.url}`, onclick: () => window.studio.openExternal(d.url) })); } el.append(row); }
  }
  else el.textContent = e.text;
  return el;
}
const nodes = new WeakMap();
function paint(e) {
  const old = nodes.get(e), el = entryEl(e);
  if (old?.tagName === "DETAILS") el.open = old.open;
  old ? old.replaceWith(el) : log.append(el);
  nodes.set(e, el); log.scrollTop = log.scrollHeight;
  if (e.kind === "plan") updateBuildBtn();
}
let saveTimer;
const chatSnapshot = () => entries.filter((e) => e.kind !== "steps" || e.steps.length).map((e) => (e.full || e.planning ? { ...e, full: false, planning: false } : e)); // the large view of a plan and a hidden answer are not remembered
const persist = () => {
  if (loading) return;
  for (const e of entries) if (e.kind === "plan" && e.planSlug) queueFileSync(e); // the plan file follows the card in the chat
  const p = project, cid = chatId, snap = chatSnapshot(); // captured now: the user may switch project or conversation before the timer fires
  clearTimeout(saveTimer); saveTimer = setTimeout(() => window.studio.saveChat(p, cid, snap), 400);
};
function push(e) { entries.push(e); paint(e); persist(); return e; }
const last = () => entries[entries.length - 1];

// ---------- model selector: what "Default" resolves to ----------
/** The simple view shows the model in use as plain text (the select is hidden): both rows follow their select. */
function syncModelNow() {
  for (const [sel, now] of [["model", "model-now"], ["dash-model", "dash-model-now"]]) { const s = $(sel), n = $(now); if (s && n) n.textContent = s.selectedOptions[0]?.textContent ?? ""; }
  setTimeout(() => refreshLimits(), 0); // the meter of plan limits follows the model (its provider and its weekly window); later, the code below is not run yet at the first call
}
const DEFAULT_MODEL_KEY = "uu5studio.defaultModel";
const prettyModel = (id) => { const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id ?? ""); return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : id; };
let defaultModelId = ""; // what Claude's "Default" stands for: the meter shows that model's weekly window
function showDefaultModel(id) {
  defaultModelId = id ?? "";
  const opt = $("model").querySelector('option[value=""]');
  if (!opt) return; // no Claude among the usable providers
  opt.textContent = id ? `Default (${prettyModel(id)})` : "Default";
  $("model").title = id ? `Default = the model from your Claude Code: ${id}. Pick another one to override it for the next requests.` : "Default = the model configured in your Claude Code.";
  syncModelNow();
}
try { showDefaultModel(localStorage.getItem(DEFAULT_MODEL_KEY)); } catch { showDefaultModel(null); }
/**
 * The model list is built from what is usable on this computer (main/agents.mjs): per provider (Claude, Codex) that is installed and signed in,
 * its own models. Both selects (message field, start screen) get the same list; the choice is remembered.
 */
const MODEL_KEY = "uu5studio.model";
let pendingModel = null; // a model a role prefers, applied when the list of models is built
function renderModels(agents) {
  let saved = ""; try { saved = localStorage.getItem(MODEL_KEY) ?? ""; } catch { /* not remembered */ }
  for (const sel of [$("model"), $("dash-model")]) {
    const keep = sel.dataset.ready ? sel.value : saved;
    sel.replaceChildren();
    if (!agents.length) { sel.append(Object.assign(document.createElement("option"), { value: "", textContent: "No AI available", disabled: true })); sel.title = "Neither Claude Code nor Codex is installed and signed in."; continue; }
    for (const a of agents) {
      const box = agents.length > 1 ? sel.appendChild(Object.assign(document.createElement("optgroup"), { label: a.label })) : sel;
      for (const m of a.models) box.append(Object.assign(document.createElement("option"), { value: m.id, textContent: m.label, title: m.description }));
    }
    sel.dataset.ready = "1";
    sel.value = keep; if (sel.value !== keep) sel.selectedIndex = 0;
    if (pendingModel && [...sel.options].some((o) => o.value === pendingModel)) sel.value = pendingModel; // chosen by a role before the list existed
    sel.title = `Model for this request: ${agents.map((a) => a.label).join(" and ")}.`;
    sel.onchange = () => { try { localStorage.setItem(MODEL_KEY, sel.value); } catch { /* not remembered */ } if (sel.id === "model") $("dash-model").value = sel.value; else $("model").value = sel.value; syncModelNow(); };
  }
  try { showDefaultModel(localStorage.getItem(DEFAULT_MODEL_KEY)); } catch { showDefaultModel(null); }
}
// ---------- plan limits of the account (meter in the chat footer) ----------
/** The last answer per provider ({ t, v }); asked again after a minute, after every request and every 5 minutes. */
const limitsCache = {};
let limitsSeq = 0, limitsRetry = null, limitsMiss = 0;
async function refreshLimits(force = false) {
  const model = $("model").value, provider = providerOf(model), my = ++limitsSeq, c = limitsCache[provider];
  if (!force && c && Date.now() - c.t < 60000) return paintLimits(c.v, model);
  const v = await window.studio.limits?.(provider, force).catch(() => null) ?? null;
  limitsCache[provider] = { t: Date.now(), v };
  if (my !== limitsSeq) return;
  paintLimits(v, $("model").value);
  // no answer (Claude Code still starting, the network): asked again after 20 s, 40 s, 80 s … up to the 5-minute round
  clearTimeout(limitsRetry);
  if (v) limitsMiss = 0; else limitsRetry = setTimeout(() => refreshLimits(true), Math.min(300000, 20000 * 2 ** limitsMiss++));
}
/** The ring shows the fullest window that applies to the model; a click opens every window with its reset. */
function paintLimits(l, model) {
  const sw = $("limsw"), ws = windowsFor(l, model, providerOf(model) === "claude" ? defaultModelId : "");
  if (l?.noPlan && providerOf(model) === "claude") return paintNoPlan(l);
  sw.hidden = !ws.length; if (!ws.length) { $("limtip").hidden = true; return; }
  const top = ws.reduce((a, w) => (w.used > a.used ? w : a)), btn = $("limbtn"), el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });
  const name = l.provider === "codex" ? "Codex" : "Claude", plan = l.plan ? ` · ${l.plan[0].toUpperCase()}${l.plan.slice(1)} plan` : "";
  btn.className = `lvl-${levelOf(top.used)}`;
  btn.querySelector(".lim-fill").setAttribute("stroke-dasharray", `${Math.max(top.used > 0 ? 2 : 0, top.used)} 100`); // a sliver even at 1 %
  btn.title = `${name}: ${top.label.toLowerCase()} ${Math.round(top.used)} % used`;
  btn.setAttribute("aria-label", `Plan limits: ${ws.map((w) => `${w.label} ${Math.round(w.used)} % used`).join(", ")}`);
  const tip = $("limtip");
  tip.replaceChildren(el("b", "", `${name}${plan}`));
  for (const w of ws) {
    const row = el("div", `lim-row lvl-${levelOf(w.used)}`), bar = el("i"); bar.style.setProperty("--u", `${w.used}%`);
    const when = resetText(w.resetsAt);
    row.append(el("span", "", w.label), el("span", "lim-p", `${Math.round(w.used)} %`), bar, el("small", "", when ? `Resets ${when}` : ""));
    tip.append(row);
  }
  tip.append(el("p", "", l.provider === "codex" ? `From the last run of Codex${l.at ? ` (${new Date(l.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })})` : ""}. Updated after every request.` : "The usage of your Claude plan, as in /usage of Claude Code. Updated after every request and every 5 minutes."));
}
/** Claude Code without plan limits (an API key): an empty grey ring, and the detail says why and how to use the subscription instead. */
function paintNoPlan(l) {
  const btn = $("limbtn"), tip = $("limtip"), el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls ?? "", textContent: text ?? "" });
  $("limsw").hidden = false; btn.className = "lvl-none"; btn.querySelector(".lim-fill").setAttribute("stroke-dasharray", "0 100");
  btn.title = "Claude Code uses an API key: no plan limits"; btn.setAttribute("aria-label", btn.title);
  tip.replaceChildren(el("b", "", "Claude · API key"),
    el("p", "lim-key", "Claude Code runs with an API key, so every request is paid per token and there are no plan limits to show."),
    el("p", "", l.envKey ? "The key comes from ANTHROPIC_API_KEY set on this computer. To use your Claude subscription instead, choose Claude account in Settings → AI providers." : "To use your Claude subscription, sign in to Claude Code with your Claude account instead of the key."));
}
setInterval(() => { if (!document.hidden) refreshLimits(true); }, 5 * 60 * 1000);
function showLimits(open) { $("limtip").hidden = !open; $("limbtn").setAttribute("aria-expanded", String(open)); }
$("limbtn").onclick = (e) => {
  e.stopPropagation();
  const open = $("limtip").hidden; dismissMenus(); showLimits(open);
  if (open) refreshLimits(true); // the detail shows fresh numbers
};
$("limtip").onclick = (e) => e.stopPropagation();
document.addEventListener("click", () => { if (!$("limtip").hidden) showLimits(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("limtip").hidden) { showLimits(false); $("limbtn").focus(); e.stopPropagation(); } }, true);

/** Chat works when Claude Code is ready or Codex is usable; without both only the chat is off, the rest of the app stays. */
let claudeReady = false, codexUsable = false;
function updateChatReady() {
  ready = claudeReady || codexUsable;
  $("send").disabled = busy || !ready || !project;
  $("send").title = ready ? "" : NO_AI;
}
const refreshAgents = (refresh) => window.studio.agents(refresh).then((agents) => { renderModels(agents); codexUsable = agents.some((a) => a.provider === "codex"); updateChatReady(); }).catch(() => { codexUsable = false; updateChatReady(); });
let sentModel = "";
// ---------- Economy: less thinking and the smallest change that does what was asked (a cheaper request)
const ECO_KEY = "uu5studio.economy";
let economy = false;
try { economy = localStorage.getItem(ECO_KEY) === "1"; } catch { /* default: off */ }
function setEconomy(on) {
  economy = Boolean(on); try { localStorage.setItem(ECO_KEY, economy ? "1" : "0"); } catch { /* not remembered */ }
  $("ecostate").textContent = economy ? "Now ON - click to turn off." : "Now OFF - click to turn on.";
  $("ecobtn").classList.toggle("on", economy); $("ecobtn").setAttribute("aria-pressed", String(economy));
}
$("ecobtn").onclick = () => setEconomy(!economy);
setEconomy(economy);
// ---------- plan mode: the agent proposes a plan with a tree of components, the user edits it, then it is built
const PLAN_KEY = "uu5studio.planMode";
let planMode = false, planPending = false;
try { planMode = localStorage.getItem(PLAN_KEY) === "1"; } catch { /* default: build */ }
function setPlanMode(on) {
  planMode = Boolean(on); try { localStorage.setItem(PLAN_KEY, planMode ? "1" : "0"); } catch { /* not remembered */ }
  for (const b of document.querySelectorAll("#modemenu .mm-item")) { const on = (b.dataset.mode === "plan") === planMode; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
  $("mode-label").textContent = planMode ? "Plan" : "Agent";
  $("mode-ico").innerHTML = planMode ? '<path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3-5 3V6a2 2 0 0 1 2-2z"/>' : '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>';
  updateBuildBtn();
  syncPlaceholder();
}
/** The hint in the message field follows what is in front of the user: no project, the sitemap, an open plan, or the canvas (Plan or Agent). */
function syncPlaceholder() {
  let key = null; try { key = planCards?.viewKey?.() ?? null; } catch { /* planCards not set up yet: the canvas */ }
  $("prompt").placeholder = !project ? "Open or create a project first…"
    : key === "@sitemap" ? "Describe what should change in the sitemap…"
    : key ? "Describe what should change in this plan…"
    : planMode ? "Describe what to plan…" : "Describe the screen you want to design…";
}
/** The last plan that waits for approval. */
const proposedPlan = () => [...entries].reverse().find((e) => e.kind === "plan" && e.state === "proposed");
/** In Plan mode with a plan waiting and an empty message field, the send button builds that plan (the button of the plan card does the same); typing a message makes it "Plan" again. */
function updateBuildBtn() {
  const build = planMode && Boolean(proposedPlan()) && !$("prompt").value.trim();
  const label = planMode ? (build ? (mapOnly(proposedPlan()) ? "Approve map" : "Build plan") : "Plan") : "Send";
  $("send-lbl").textContent = label; $("send").setAttribute("aria-label", label);
  $("send").dataset.build = build ? "1" : "";
  $("send").title = build ? (mapOnly(proposedPlan()) ? "Approve the map above: nothing is built, the screens are created page by page" : "Approve the plan above (with your edits and answers) and let the agent build it") : "";
}
/** The library components of a tree that the documentation of the plugin knows (the others are flagged in the plan). */
async function refreshKnown(e) {
  const names = []; const walk = (n) => { if (n.kind === "library") names.push(n.name); (n.children ?? []).forEach(walk); }; if (e.tree) walk(e.tree);
  const r = names.length ? await window.studio.docsDescribe([...new Set(names)]).catch(() => null) : { names: [] };
  const known = r?.names ?? [];
  if (JSON.stringify(known) !== JSON.stringify(e.known ?? [])) { e.known = known; paint(e); persist(); }
}
/** The answer of a message sent in plan mode becomes a plan (when it holds a tree). */
function convertPlan() {
  let i = entries.length - 1; while (i >= 0 && entries[i].kind !== "ai") { if (entries[i].kind === "user") return; i--; }
  const ai = entries[i]; if (!ai) return;
  const { text, tree, questions, sitemap } = extractPlan(ai.text);
  if (!text.trim() && !tree && !questions.length && !sitemap) return;
  const plan = { kind: "plan", text, tree, questions, sitemap, answers: {}, mode: "diagram", original: { text, tree: tree ? JSON.parse(JSON.stringify(tree)) : null, sitemap: sitemap ? JSON.parse(JSON.stringify(sitemap)) : null }, state: "proposed", editing: false, sel: [], known: [] };
  // a revised plan (answers, "Revise…") replaces the plan before it: the same file and card, not a second one
  const prev = [...entries].reverse().find((x) => x.kind === "plan" && x.planSlug && (x.state === "proposed" || x.state === "superseded"));
  if (prev) { plan.planSlug = prev.planSlug; /* the title follows the text of the revised plan */ delete prev.planSlug; prev.synced = null; prev.state = "superseded"; prev.editing = false; paint(prev); }
  nodes.get(ai)?.remove(); entries[i] = plan; paint(plan); persist(); refreshKnown(plan); savePlanFile(plan);
}
// ---------- plans as files: every plan of the chat is also plans/<name>.md and a card on the canvas; the file is the truth (edited there, by the agent or in an editor)
const PLAN_STATUS = { proposed: "draft", approved: "approved", discarded: "discarded", superseded: "discarded" };
const planBody = (e) => [e.text.trim(), e.tree ? `\`\`\`uu5-tree\n${serializeTree(e.tree)}\n\`\`\`` : "", e.sitemap ? `\`\`\`uu5-sitemap\n${serializeSitemap(e.sitemap)}\n\`\`\`` : "", e.questions?.length ? `\`\`\`uu5-questions\n${JSON.stringify({ questions: e.questions }, null, 2)}\n\`\`\`` : ""].filter(Boolean).join("\n\n");
const planTitleOf = (e) => (e.text.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? e.text.split("\n").find((l) => l.trim()) ?? "Plan").replace(/[#*`_>]/g, "").trim().slice(0, 60) || "Plan";
const fileTimers = new Map();
async function savePlanFile(e) {
  const body = planBody(e), status = PLAN_STATUS[e.state] ?? "draft";
  const r = await window.studio.plansSave({ slug: e.planSlug, title: e.planTitle ?? planTitleOf(e), markdown: body, status });
  if (r?.error || !r?.slug) return;
  e.planSlug = r.slug; e.synced = { body, status }; paint(e); persist();
  const list = await window.studio.plansList(); if (!list.error) await planCards.setPlans(list);
  planCards.focus(r.slug);
}
/** The entry of the chat goes to the file (after a short pause) when it differs from what the file last held. */
function queueFileSync(e) {
  const body = planBody(e), status = PLAN_STATUS[e.state] ?? "draft";
  if (e.synced && e.synced.body.trim() === body.trim() && e.synced.status === status) return;
  clearTimeout(fileTimers.get(e)); fileTimers.set(e, setTimeout(async () => {
    const b = planBody(e), st = PLAN_STATUS[e.state] ?? "draft";
    e.synced = { body: b, status: st }; // set before the write: the change event of the file then finds nothing new
    const r = await window.studio.plansSave({ slug: e.planSlug, title: e.planTitle, markdown: b, status: st });
    if (r?.error) e.synced = null;
  }, 600));
}
/** What changed in the file (a card, the agent, an editor) comes into the entry of the chat. Returns true when the entry changed. */
async function pullEntry(e) {
  const r = await window.studio.plansRead(e.planSlug).catch(() => null);
  if (!r || r.error) return false;
  const body = r.body.trim(), changed = !e.synced || e.synced.body.trim() !== body, status = r.status;
  if (!changed && e.synced.status === status) return false;
  if (changed) {
    const x = extractPlan(body), old = e.answers ?? {};
    e.text = x.text; e.tree = x.tree; e.sitemap = x.sitemap; e.questions = x.questions; e.answers = Object.fromEntries(x.questions.map((q) => [q.id, old[q.id] ?? { choices: [] }]));
    e.planTitle = r.meta.title; e.sel = [];
  }
  if (status !== e.synced?.status) e.state = status === "approved" ? "approved" : status === "discarded" ? "discarded" : e.state === "approved" || e.state === "discarded" ? "proposed" : e.state;
  e.synced = { body, status };
  paint(e); persist(); refreshKnown(e); updateBuildBtn();
  return true;
}
async function onPlansChanged(list) {
  plansCache = list; plansMenu?.render?.();
  await planCards.setPlans(list); syncEmptyForCards();
  const slugs = new Set(list.map((p) => p.slug));
  for (const e of entries) {
    if (e.kind !== "plan" || !e.planSlug) continue;
    if (!slugs.has(e.planSlug)) { delete e.planSlug; e.synced = null; paint(e); persist(); continue; } // the file is gone: the card of the chat stays alone
    await pullEntry(e);
  }
}
/** A request for a revision of a plan from its card (e.g. add the sitemap): this one request is sent in Plan mode, the answer replaces the text of the same file.
 *  The Agent / Plan switch of the chat stays as the user set it: the next message typed in the chat is not turned into a plan. */
async function revisePlanFromCard(message, label) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  push({ kind: "user", text: label });
  if (window.__plan?.dryRun) { window.__plan.lastAnswer = message; return; }
  setBusy(true); sentModel = $("model").value; setPlanPending(true);
  window.studio.send(message, sentModel || undefined, { plan: true, economy });
}
/** Where the map is: the file of the project, or the plan that proposes it. */
const sitemapWhere = (slug) => (slug ? `proposed in plans/${slug}.md` : "sitemap.json");
/** Several selected pages become screens (at most 8, after a confirmation): the agent builds exactly these, one after the other. */
async function createScreensFromPages({ slug, items }) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  if (!items.length || items.length > 8) return;
  if (!confirm(`Create ${items.length} screens: ${items.map((i) => i.node.title).join(", ")}?`)) return;
  setPlanMode(false);
  const list = items.map((i) => `- ${i.file}: the page "${i.node.title}" (place in the map: ${i.where}${i.node.note ? `; what it is for: ${i.node.note}` : ""})`).join("\n");
  const message = `Create these screens for pages of the sitemap of the project (${sitemapWhere(slug)}), and no other screen:\n${list}\nTheir navigation follows the sitemap: link to the parent and sibling pages, and to the screens that exist, by their file names.`;
  push({ kind: "user", text: `Create ${items.length} screens: ${items.map((i) => i.node.title).join(", ")}.` });
  if (window.__plan?.dryRun) { window.__plan.lastBuild = message; return; }
  setBusy(true); sentModel = $("model").value;
  window.studio.send(message + await sourcesOf(items.map((i) => i.node)), sentModel || undefined, { plan: false, economy });
}
/** One page of a sitemap becomes a screen: the agent builds just this page, in the place the map gives it. */
async function createScreenFromPage({ slug, node, file, where }) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  setPlanMode(false);
  const message = `Create the screen ${file} for the page "${node.title}" of the sitemap of the project (${sitemapWhere(slug)}) (place in the map: ${where}${node.note ? `; what it is for: ${node.note}` : ""}${(node.children ?? []).some((c) => c.type === "section") ? `; its sections, which are parts of this page, not screens: ${node.children.filter((c) => c.type === "section").map((c) => c.title).join(", ")}` : ""}). Build only this screen. Its navigation follows the sitemap: link to its parent and sibling pages, and to the screens that exist, by their file names.`;
  push({ kind: "user", text: `Create the screen for the page “${node.title}”.` });
  if (window.__plan?.dryRun) { window.__plan.lastBuild = message; return; }
  setBusy(true); sentModel = $("model").value;
  window.studio.send(message + await sourcesOf([node]), sentModel || undefined, { plan: false, economy });
}
/**
 * The pages of a sitemap taken from a link remember where they come from (`source`): before their screens are built the app reads those pages
 * (a snapshot in .studio/sources, as for a pasted link), so the agent has their content. A page that cannot be read does not stop the build.
 */
async function sourcesOf(nodes) {
  const urls = [...new Set(nodes.map((n) => n?.source).filter(Boolean))];
  if (!urls.length) return "";
  toast(urls.length === 1 ? "Reading the source page first…" : `Reading the ${urls.length} source pages first…`);
  const docs = [];
  for (const url of urls) { const r = await window.studio.docFetch(url).catch(() => null); if (r?.ok) docs.push({ url, kind: r.kind, title: r.title, file: r.file, shot: r.shot }); }
  if (docs.length < urls.length) toast(`${urls.length - docs.length === 1 ? "A source page" : `${urls.length - docs.length} source pages`} could not be read (a Plus4U document needs the sign-in: paste its link into the message to sign in). The screen is built without it.`, { err: true });
  return docs.length ? `\n\n${docsContext(docs)}` : "";
}
/** The map in the file of a plan (a plan without a chat card, or an older one) becomes the sitemap of the project; the plan keeps its text and a note. */
async function adoptFromFile(slug) {
  const r = await window.studio.plansRead(slug); if (r.error) { toast(r.error, { err: true }); return false; }
  const x = extractPlan(r.body); if (!x.sitemap) return false;
  const w = await window.studio.sitemapWrite(x.sitemap, { backup: true }); if (!w || w.error) { toast(w?.error ?? "The sitemap could not be saved.", { err: true }); return false; }
  setProjectSitemap(w); planCards.focus("@sitemap");
  const p = parsePlan(r.text), body = `${extractSitemap(p.body).text.trim()}\n\n> The sitemap of this plan was approved: it is now the sitemap of the project (the Sitemap card).\n`;
  await window.studio.plansWrite(slug, serializePlan({ meta: p.meta, body }));
  return true;
}
/** "Use as the sitemap of the project" on the card of a plan. */
async function adoptPlanMap(slug) {
  const e = entries.find((x) => x.kind === "plan" && x.planSlug === slug && x.sitemap);
  if (e) { await pullEntry(e); if (e.sitemap && await adoptSitemap(e)) { paint(e); persist(); toast("The map is now the sitemap of the project."); } return; }
  if (await adoptFromFile(slug)) toast("The map is now the sitemap of the project.");
}
async function approvePlanFile(slug) {
  const e = entries.find((x) => x.kind === "plan" && x.planSlug === slug && x.state === "proposed");
  if (e) { await pullEntry(e); return buildPlan(e); }
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  const r = await window.studio.plansRead(slug); if (r.error) return toast(r.error, { err: true });
  const x = extractPlan(r.body);
  if (x.sitemap) {
    if (!(await adoptFromFile(slug))) return;
    await window.studio.plansStatus(slug, "approved");
    if (!x.tree) return toast("The map is approved and is now the sitemap of the project. Nothing was built: create the screens page by page.");
  }
  setPlanMode(false); planCards.closeView(); // the screens are built now: the canvas shows them
  const message = `Plan approved: build it as written in plans/${slug}.md. The user may have edited it, so follow this version exactly:\n\n${r.body.trim()}`;
  await window.studio.plansStatus(slug, "approved");
  push({ kind: "user", text: "Build the plan." });
  if (window.__plan?.dryRun) { window.__plan.lastBuild = message; return; }
  setBusy(true); sentModel = $("model").value;
  window.studio.send(message, sentModel || undefined, { plan: false, economy });
}
/** The bar over the canvas after a rearrangement of components: the screen shows the result; keep it or undo it. */
let previewPending = null;
function showPreviewBar(p) {
  previewPending = p;
  const bar = $("previewbar"), many = (n) => (n === 1 ? "1 move" : `${n} moves`);
  $("pv-text").textContent = `${p.name}: ${p.done ? `${many(p.done)} done in the file, the screen shows the result.` : "nothing could be moved in the file directly."}${p.failed.length ? ` ${many(p.failed.length)} need${p.failed.length === 1 ? "s" : ""} the agent.` : ""}`;
  $("pv-keep").textContent = p.message ? (p.done ? "Keep and let the agent do the rest" : "Let the agent do it") : "Keep";
  $("pv-undo").textContent = p.done ? "Undo" : "Cancel";
  bar.hidden = false;
}
function closePreviewBar() { $("previewbar").hidden = true; previewPending = null; }
$("pv-undo").onclick = async () => {
  const p = previewPending; closePreviewBar(); if (!p || !p.done) return;
  const r = await window.studio.screenUndo(p.file).catch((e) => ({ error: String(e?.message ?? e) }));
  toast(r.error ?? `Undone: ${r.label}.`, { err: Boolean(r.error) });
};
$("pv-keep").onclick = () => {
  const p = previewPending; closePreviewBar(); if (!p?.message) return;
  setPlanMode(false);
  push({ kind: "user", text: `Rebuild ${p.name} with the rearranged structure${p.done ? " (the rest of the moves is done)" : ""}.` });
  if (window.__plan?.dryRun) { window.__plan.lastBuild = p.message; return; }
  setBusy(true); sentModel = $("model").value; setPlanPending(false);
  window.studio.send(p.message, sentModel || undefined, { plan: false, economy });
};
/** Undo / redo of the last change the app made to the screen. */
let lastScreenChange = 0; // when the content of a screen changed last (to tell which comes first on ⌘Z: this or the arrangement)
async function stepScreen(file, way) {
  lastScreenChange = Date.now();
  const r = await (way === "undo" ? window.studio.screenUndo(file ?? null) : window.studio.screenRedo(file ?? null)).catch((e) => ({ error: String(e?.message ?? e) }));
  toast(r.error ?? `${way === "undo" ? "Undone" : "Redone"}: ${r.label}${r.file ? ` (${r.file.replace(/\.html$/, "")})` : ""}.`, { err: Boolean(r.error) });
}
/** Edit > Undo / Redo (⌘Z): the typing in a text field, otherwise the last change of the screen. */
/** The sitemap keeps the one map it replaced, so Undo and Redo swap them: `smUndone` says on which side we are (a new change of the map resets it). */
let smUndone = false;
async function sitemapStep(way) {
  if ((way === "undo") === smUndone) return toast(way === "undo" ? "Nothing to undo in the sitemap." : "Nothing to redo in the sitemap.");
  const r = await window.studio.sitemapRestore().catch((e) => ({ error: String(e?.message ?? e) }));
  if (r?.error) return toast(r.error, { err: true });
  smUndone = way === "undo"; setProjectSitemap(r);
  toast(way === "undo" ? "Undone: the last change of the sitemap." : "Redone: the change of the sitemap.");
}
function editStep(way) {
  const a = document.activeElement;
  if (a && ((a.isContentEditable) || ((a.tagName === "INPUT" || a.tagName === "TEXTAREA") && !a.readOnly && !a.disabled))) return void document.execCommand(way);
  if (planCards.sitemapFocused()) return void sitemapStep(way);
  // an arrangement of the screens that is newer than the last change of a screen's content is stepped back first
  const h = canvas.layoutHistory();
  if (h[way] && h.at >= lastScreenChange && (way === "undo" ? canvas.undoLayout() : canvas.redoLayout())) return void toast(`${way === "undo" ? "Undone" : "Redone"}: position of the screens.`);
  stepScreen(inspectedFile(), way);
}
const planCtx = {
  change: (e) => { paint(e); persist(); },
  persist: () => persist(),
  checkNames: (e) => refreshKnown(e),
  chooseComponent: async () => (await libraryPicker.open())?.[0] ?? null,
  revise: () => { setPlanMode(true); const t = $("prompt"); t.value = "Revise the plan: "; t.focus(); t.setSelectionRange(t.value.length, t.value.length); },
  discard: (e) => { e.state = "discarded"; e.editing = false; paint(e); persist(); },
  build: (e) => buildPlan(e),
  answer: (e) => answerPlan(e),
  openPlan: (e) => e.planSlug && planCards.focus(e.planSlug),
  openSitemap: () => planCards.focus("@sitemap"),
  showDetail: async (name, host) => {
    const old = host.querySelector(":scope > .pn-detail"); if (old) return old.remove();
    const d = await window.studio.docsDetail(name).catch(() => null); if (!d) return;
    const box = Object.assign(document.createElement("div"), { className: "pn-detail" });
    box.append(Object.assign(document.createElement("p"), { textContent: d.description || "No description." }));
    const meta = Object.assign(document.createElement("p"), { className: "mute" }); meta.append(`${d.props.length} props`);
    if (d.url) { const a = Object.assign(document.createElement("a"), { href: "#", textContent: " · Docs ↗", onclick: (ev) => { ev.preventDefault(); window.studio.docsOpen(d.url); } }); meta.append(a); }
    box.append(meta); host.querySelector(":scope > .pn")?.after(box);
  },
};
/** The answers to the questions go back to the agent, still in Plan mode: it returns an updated plan; the old one is marked as replaced. */
async function answerPlan(e) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  const message = ["My answers to your questions:", answersText(e.questions, e.answers),
    ...(e.tree ? ["", "Update the plan with them. This is the current component tree, including my edits; keep them unless the answers change it:", "```uu5-tree", serializeTree(e.tree), "```"] : [])].join("\n");
  e.state = "superseded"; e.editing = false; paint(e); persist();
  push({ kind: "user", text: "Here are my answers, update the plan." });
  setPlanMode(true);
  if (window.__plan?.dryRun) { window.__plan.lastAnswer = message; return; }
  setBusy(true); sentModel = $("model").value; setPlanPending(true);
  window.studio.send(message, sentModel || undefined, { plan: true, economy });
}
const syncEmptyForCards = () => $("empty")?.classList.toggle("has-cards", planCards.visibleCount() > 0);
/** The sitemap of the project (sitemap.json) as the card shows it: { sitemap, hasPrev } or null. */
let projectSitemap = null;
let p4uOn = false; // signed in to Plus4U with a usable token: only then the Plus4U features show
let plus4uBar = null; // the Plus4U link in the toolbar (created further down; loadProject may run before)
function setProjectSitemap(r) { projectSitemap = r?.sitemap ? r : null; if (projectSitemap) takeOldMapNotes(); planCards.setSitemap(projectSitemap); syncEmptyForCards(); updateMapBtn(); plansMenu?.render?.(); sitemapMenu?.render?.(); }
/** Whether this project gets the sitemap offered: it has one, or it was started as a whole web site or portal (sitemap.js). */
const mapOffered = () => Boolean(project) && sitemapOffered({ hasSitemap: Boolean(projectSitemap), scope: projectScope, level: projectLevel });
/** The Sitemap button of the toolbar is there only where a sitemap is offered; elsewhere it is made from the Plans menu. */
function updateMapBtn() { const on = mapOffered(); if ($("mapw").hidden !== !on) { $("mapw").hidden = !on; if (!on) sitemapMenu?.close?.(); planCards?.refresh?.(); } }
/** An approved plan with a map: the map becomes the sitemap of the project (the one it replaces is kept), and the plan keeps only a note about it. */
async function adoptSitemap(e, { focus = true } = {}) {
  const r = await window.studio.sitemapWrite(e.sitemap, { backup: true });
  if (!r || r.error) { toast(r?.error ?? "The sitemap could not be saved.", { err: true }); return false; }
  setProjectSitemap(r); if (focus) planCards.focus("@sitemap");
  e.sitemap = null; e.sitemapMoved = true; if (e.original) e.original.sitemap = null;
  e.text = `${e.text.trim()}\n\n> The sitemap of this plan was approved: it is now the sitemap of the project (the Sitemap card).`;
  return true;
}
/** A plan that is only a sitemap (no component tree) has nothing to build: approving it agrees on the structure; the screens are created page by page. */
const mapOnly = (e) => Boolean(e?.sitemap && !e.tree);
async function buildPlan(e) {
  if (mapOnly(e)) {
    if (!(await adoptSitemap(e))) return;
    e.state = "approved"; e.editing = false; paint(e); persist(); updateBuildBtn();
    if (isSimple()) setPlanMode(false); // the Simple view has no Agent / Plan switch: after the map the pages are built
    push({ kind: "note", text: "The map is approved and is now the sitemap of the project (the plan card is off the canvas: the Plans button brings it back). Nothing was built: create the screens page by page (select a page of the map and choose Create the screen), or a few at a time." });
    return;
  }
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  setPlanMode(false); // building is the agent's work: the message field goes back to Agent
  const message = approvalMessage({ text: e.text, tree: e.tree, sitemap: e.sitemap, original: e.original, questions: e.questions, answers: e.answers });
  if (e.sitemap && !(await adoptSitemap(e, { focus: false }))) return;
  planCards.closeView(); // the screens are built now: the canvas shows them as they come (the map and the plan are a click away)
  e.state = "approved"; e.editing = false; paint(e); persist();
  push({ kind: "user", text: message.startsWith("Plan approved: build") && !message.includes("Answers of the user") ? "Build the plan." : "Build the plan, as I edited it and answered." });
  if (window.__plan?.dryRun) { window.__plan.lastBuild = message; return; } // the automated checks read the message instead of starting the agent
  setBusy(true); sentModel = $("model").value;
  window.studio.send(message, sentModel || undefined, { plan: false, economy });
}
/** For the automated checks: an answer of the agent in plan mode, without the agent. */
window.__plan = { dryRun: false, lastBuild: null, lastAnswer: null, answer(text) { setPlanMode(true); push({ kind: "user", text: "(plan)" }); push({ kind: "ai", text, done: true }); setPlanPending(true); convertPlan(); } };
{
  const menu = $("modemenu"), btn = $("modebtn");
  const setOpen = (on) => { menu.hidden = !on; btn.setAttribute("aria-expanded", String(on)); };
  btn.onclick = (e) => { e.stopPropagation(); const willOpen = menu.hidden; dismissMenus(); setOpen(willOpen); }; // closes the other dropdowns, then toggles this one
  for (const b of menu.querySelectorAll(".mm-item")) b.onclick = () => { setPlanMode(b.dataset.mode === "plan"); setOpen(false); $("prompt").focus(); };
  addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); btn.focus(); } });
}
$("prompt").addEventListener("input", updateBuildBtn);
setPlanMode(planMode);
function learnDefaultModel(id) {
  if (sentModel !== "" || !id) return; // only when no explicit model was requested
  try { localStorage.setItem(DEFAULT_MODEL_KEY, id); } catch {}
  showDefaultModel(id);
}

// ---------- "Claude is working" indicator ----------
const WORK = {
  Shell: "Running a command…", Skill: "Loading rules and templates…", Read: "Reading files…", Glob: "Searching files…", Grep: "Searching file contents…",
  Write: "Writing the mockup…", Edit: "Editing the mockup…", MultiEdit: "Editing the mockup…",
  "mcp__studio-browser__browser_open": "Opening the preview…", "mcp__studio-browser__browser_reload": "Verifying the render…",
  "mcp__studio-browser__browser_console": "Reading the console…", "mcp__studio-browser__browser_snapshot": "Checking the content…", "mcp__studio-browser__browser_screenshot": "Taking a screenshot…",
};
const EMPTY_TEXT = "No mockup yet. Describe it in the chat.";
let workStart = 0, workTimer;
// Which screen the agent is working on: shown on the canvas frame, its tab and .
let workFile = null;
function setWorkFile(file) {
  workFile = file; canvas.setWorking(file); renderTabs();
}
const turnFiles = new Set(); // the screens the agent wrote in the running request
const toolFile = (b) => { const i = b.input ?? {}, p = i.file_path ?? i.path ?? i.file; return typeof p === "string" && p.endsWith(".html") ? p.split("/").pop() : null; };
function updateScreenCtx() {
  const el = $("screenctx");
  el.hidden = !fsFile; if (!fsFile) return;
  el.replaceChildren("Working on ", Object.assign(document.createElement("b"), { textContent: fsFile.replace(/\.html$/, "") }), " (fullscreen)");
}
function setWork(label) { if (busy) $("work-label").textContent = label; }
function tickWork() { const s = Math.round((Date.now() - workStart) / 1000); $("work-time").textContent = s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; }
/** The project made from the dashboard gets the name of its first screen (the agent has chosen a good one by then). */
async function nameAfterFirstScreen() {
  if (!autoNamed || autoNamed !== project || busy) return;
  const first = canvas.files()[0]; if (!first) return;
  const taken = projectList.map((p) => p.name).filter((n) => n !== project);
  let name = null;
  if (autoLevel === "app") name = projectNameFromTitle(await window.studio.screenTitle(first), taken); // an application is named after the application, not after its first route
  name ??= projectNameFromScreen(first, taken);
  autoNamed = null;
  if (name && name !== project) await changeProject(() => window.studio.renameProject(project, name));
}
function setBusy(b) {
  const was = busy; busy = b; setup?.paintStrip();
  for (const x of document.querySelectorAll(".pc-mapadd")) x.disabled = b; // the agent is at work: no second request from a plan card
  if (was && !b) setTimeout(nameAfterFirstScreen, 700); updateBuildBtn();
  $("stop").hidden = !b; $("send").hidden = b; $("send").disabled = !ready || !project;
  $("working").hidden = !b; $("chatbusy").hidden = !b; $("chatbubble").classList.toggle("busy", b);
  clearInterval(workTimer);
  if (!b && workFile) setWorkFile(null);
  if (b) {
    if (!was) { workStart = Date.now(); $("work-label").textContent = "Thinking…"; }
    tickWork(); workTimer = setInterval(tickWork, 1000);
  }
  $("empty").classList.toggle("working", b);
  paintEmpty();
}
/** The text in the middle of an empty canvas: what the agent is preparing (a plan in Plan mode, else a screen), or the invitation. */
function paintEmpty() { $("empty-text").textContent = busy ? (planPending ? "Preparing the plan…" : "Preparing a screen…") : EMPTY_TEXT; }
/** Whether the running request ends with a plan; the empty canvas says so. */
function setPlanPending(v) { planPending = Boolean(v); paintEmpty(); }
/** The answers of Plan mode that were hidden while they were written are shown as they are (when they did not become a plan). */
function clearPlanning() { for (const e of entries) if (e.planning) { e.planning = false; paint(e); } }
function finishSteps(status) { for (const e of entries) if (e.kind === "steps") { for (const s of e.steps) if (s.status === "run") s.status = status; paint(e); } }

let ctxNow = 0; // the size of the context after the last API call of the running request
/** The bar over the message field when the conversation has grown so much that every step of the agent is dear. */
function updateCtxWarn() {
  const lastU = [...entries].reverse().find((e) => e.kind === "usage" && e.ctx);
  const ctx = lastU?.ctx ?? 0, key = `uu5studio.ctxwarn.${chatId}`;
  let hidden = 0; try { hidden = Number(localStorage.getItem(key)) || 0; } catch { /* not remembered */ }
  const show = ctx >= CONTEXT_WARN && ctx >= hidden + CONTEXT_WARN; // hidden: shown again when the context has grown by another step of 200k
  $("ctxwarn").hidden = !show;
  if (show) $("cw-text").textContent = `This conversation has grown to ${formatTokens(ctx)} tokens and every step of the agent reads all of it again. A new conversation is much cheaper: the screens, rules and notes stay in the project.`;
}
$("cw-x").onclick = () => { const lastU = [...entries].reverse().find((e) => e.kind === "usage" && e.ctx); try { localStorage.setItem(`uu5studio.ctxwarn.${chatId}`, String(lastU?.ctx ?? 0)); } catch { /* not remembered */ } updateCtxWarn(); };
$("cw-new").onclick = async () => {
  const lastUser = [...entries].reverse().find((e) => e.kind === "user" && e.text), screens = canvas.files().map((f) => f.replace(/\.html$/, "")).join(", ");
  await $("newchat").onclick();
  const excerpt = (lastUser?.text ?? "").replace(/\s+/g, " ").slice(0, 300);
  $("prompt").value = `Continue the work on this project. The screens are: ${screens || "(none yet)"}; the rules and notes are in the project files.${excerpt ? ` The last request before was: “${excerpt}”.` : ""} `;
  $("prompt").focus(); $("prompt").setSelectionRange($("prompt").value.length, $("prompt").value.length);
};

/** The tokens of this request: the counters of the result are cumulative over the conversation, so the previous result is subtracted. */
function pushUsage(cum) {
  if (!cum) return;
  if (cum.perRequest) { push({ kind: "usage", ...cum, cum, ctx: undefined }); persist(); return; } // the counters are of this request alone
  const prevE = [...entries].reverse().find((e) => e.kind === "usage" && !e.perRequest); // a provider that counts per request has no counter to subtract
  const prev = prevE ? (prevE.cum ?? { in: prevE.in, out: prevE.out, cacheRead: prevE.cacheRead, cacheWrite: prevE.cacheWrite, models: prevE.models }) : null; // an entry of an older version holds the counters themselves
  const ctx = ctxNow || undefined;
  if (!prev && entries.filter((e) => e.kind === "user").length > 1) push({ kind: "usage", ...cum, cum, sofar: true, ctx }); // earlier requests were not measured: only the total is known
  else { const d = usageDelta(cum, prev); if (d) push({ kind: "usage", ...d, cum, ctx }); }
  persist(); updateCtxWarn();
}
/** The events of the provider behind the agent (Claude, Codex…), see src/main/providers/events.mjs. */
const onAgentEvent = (m) => {
  if (m.type === "init") learnDefaultModel(m.model);
  else if (m.type === "status") setWork(m.kind === "tool" ? (WORK[m.tool] ?? "Working…") : m.kind === "thinking" ? "Thinking…" : "Writing the answer…");
  else if (m.type === "text_delta") {
    setWork("Writing the answer…");
    let e = last(); if (e?.kind !== "ai" || e.done) e = push({ kind: "ai", text: "" });
    e.text += m.text; if (planPending) e.planning = true; paint(e);
  } else if (m.type === "turn") {
    ctxNow = m.ctx || ctxNow;
    const e = last(); if (e?.kind === "ai") e.done = true;
    for (const b of m.tools) {
      let g = last(); if (g?.kind !== "steps") g = push({ kind: "steps", steps: [] });
      g.steps.push({ id: b.id, label: labelOf(b), status: "run" }); paint(g);
      setWork(WORK[b.name] ?? labelOf(b));
      const wf = toolFile(b); if (wf) setWorkFile(wf);
      if (wf && /^(Write|Edit|MultiEdit|apply_patch|write_file|edit_file)$/i.test(b.name ?? "")) turnFiles.add(wf); // a screen the agent changed: checked against the code when the answer is done
    }
  } else if (m.type === "tool_result") {
    for (const g of entries) if (g.kind === "steps") {
      const s = g.steps.find((x) => x.id === m.id); if (s) { s.status = m.isError ? "bad" : "ok"; paint(g); persist(); }
    }
    setWork("Thinking…");
  } else if (m.type === "result") {
    setTimeout(() => refreshLimits(true), 1500); // the request used some of the plan: the meter catches up
    finishSteps("ok"); setBusy(false); clearPlanning(); if (planPending) { setPlanPending(false); if (!m.isError) convertPlan(); } persist();
    if (m.isError) push({ kind: "err", text: `Error: ${m.text}` });
    pushUsage(m.usage); // below the answer, and below the card of a plan
    const changed = [...turnFiles]; turnFiles.clear();
    if (!m.isError && changed.length && project) window.studio.componentExceptions?.(changed).then((list) => { for (const x of list ?? []) push({ kind: "exceptions", file: x.file, origin: x.origin, lines: x.lines }); if (list?.length) persist(); }).catch(() => {});
  } else if (m.type === "stopped") {
    turnFiles.clear(); setPlanPending(false); finishSteps("bad"); setBusy(false); clearPlanning(); push({ kind: "note", text: "Zastaveno" });
  } else if (m.type === "app_error") {
    setPlanPending(false); finishSteps("bad"); setBusy(false); clearPlanning(); push({ kind: "err", text: m.message }); checkClaude(true);
  }
};
window.studio.onEvent(onAgentEvent);
window.__feed = onAgentEvent; // lets automated checks play events of the agent without running it

// ---------- canvas (frames, zoom/pan, devices) ----------
let planCards = null, saveLayoutTimer, savedLayout = {}, rules = null, desc = null, flow = null, vlayer = null; let flowHover = null;
// environments (uuManagementKit around the content): offered on every screen
let projectLevel = null, projectScope = null, defaultEnv = null, envInfo = null;
async function refreshEnvs() { const r = await window.studio.envList(); if (!r.error) { envInfo = r; for (const f of canvas.all()) f.syncEnv?.(); } }
const persistLayout = () => {
  if (loading || !project) return;
  const p = project, layout = { frames: canvas.layout(), camera: canvas.camera(), plans: planCards?.layout() ?? {} };
  clearTimeout(saveLayoutTimer); saveLayoutTimer = setTimeout(() => window.studio.saveLayout(p, layout), 500);
};
/** What the file cannot do by itself (a move into a condition, a list, another component) is given to the agent with both places named. */
async function askAgentToMove({ file, name, ordinal, target, position, reason }) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  const info = async (o) => (await window.studio.jsxInspect(file, [o]).catch(() => null))?.element;
  const [from, to] = await Promise.all([info(ordinal), info(target)]);
  const desc = (e, fallback) => (e ? `${e.name} (in the JSX: ${e.snippet})` : fallback);
  const message = `In ${file}, move the component ${desc(from, name ?? "the dragged one")} ${position} the component ${desc(to, "the target")}. The user dragged it there on the screen (the app could not do it itself: ${reason}). Keep its props and content, make it work in the new place and change nothing else.`;
  push({ kind: "user", text: `Move ${name ?? "the component"} ${position} ${to?.name ?? "the other component"} in ${file}.` });
  setBusy(true); sentModel = $("model").value; setPlanPending(false);
  window.studio.send(message, sentModel || undefined, { plan: false, economy });
}
// a component dragged to another place of its screen while the inspector is on (inspector.js): moved in the file like a move in the structure dialog
async function moveInScreen({ file, ordinal, target, position, name, targetName }) {
  const label = (n) => (n ? n.replace(/^(Uu5|Plus4U5)\w*\./, "") : "the component");
  const r = await window.studio.jsxMoves(file, [{ ordinal, target, position, name, targetName }]).catch((e) => ({ error: String(e?.message ?? e) }));
  if (r?.error) return toast(r.error, { err: true });
  if (r.failed?.length) return toast(`${label(name)} was not moved: ${r.failed[0].reason}.`, { err: true, action: { label: "Ask the agent", run: () => askAgentToMove({ file, name, targetName, ordinal, target, position, reason: r.failed[0].reason }) } });
  markAfterReload(file, r.moved);
  toast(`${label(name)} moved ${position === "inside" ? "inside" : position} ${label(targetName)}.`, { action: { label: "Undo", run: () => stepScreen(file, "undo") } });
}
// after a component was added, moved or copied the page is rendered again: the new place of it is marked as soon as the inspector is in the new page
let pendingPick = null;
const markAfterReload = (file, ordinals) => { if (inspector.on && !chatPick && ordinals?.length) pendingPick = { file, ordinals, until: Date.now() + 10000 }; };
const takePending = (file) => { const p = pendingPick; if (!p || Date.now() > p.until) return (pendingPick = null); if (p.file !== file) return null; pendingPick = null; return p.ordinals; };
/** The marked components and list items by screen: [{ file, items: [{ ordinal, name, sub: { prop, index } | null }] }] (`ordinal` = the component, for an item the one whose list it is). */
/** A copy of a component rendered by `.map` (Cmd / Ctrl + click) is one JSX element for all copies: it is not deleted or copied in the file, the agent changes its item. */
function copyRefused(list) {
  if (!list.some((m) => m.inst)) return false;
  toast("A single copy from .map cannot be deleted or copied here (the file has one element for all copies). Use it in the chat and say what to do with that item.", { err: true });
  return true;
}
function markedByFile() {
  const by = new Map();
  for (const m of marked) {
    if (!Number.isInteger(m.chain?.[0])) continue;
    if (!by.has(m.file)) by.set(m.file, []);
    by.get(m.file).push({ ordinal: m.chain[0], name: null, sub: m.sub ? { prop: m.sub.prop, index: m.sub.index } : null });
  }
  return [...by].map(([file, items]) => ({ file, items }));
}
/** The items of lists in `items` as one change per list: [{ ordinal, prop, indexes }] (the other items are the components). */
function listGroups(items) {
  const by = new Map();
  for (const i of items.filter((x) => x.sub)) { const k = `${i.ordinal}|${i.sub.prop}`; if (!by.has(k)) by.set(k, { ordinal: i.ordinal, prop: i.sub.prop, indexes: [] }); by.get(k).indexes.push(i.sub.index); }
  return [...by.values()];
}
async function duplicateInScreen({ file, items }) {
  const comps = items.filter((i) => !i.sub), copies = [], problems = [];
  if (comps.length) {
    const r = await window.studio.jsxDuplicate(file, comps.map((i) => i.ordinal)).catch((e) => ({ error: String(e?.message ?? e) }));
    if (r?.error) problems.push(r.error); else { copies.push(...r.copies); problems.push(...(r.failed ?? []).map((f) => f.reason)); }
  }
  for (const g of listGroups(items)) {
    const r = await window.studio.jsxItems(file, g.ordinal, g.prop, "duplicate", g.indexes).catch((e) => ({ error: String(e?.message ?? e) }));
    if (r?.error) problems.push(r.error); else copies.push(...r.copies.map((index) => ({ ordinal: g.ordinal, prop: g.prop, index })));
  }
  if (copies.length) markAfterReload(file, copies);
  if (problems.length) return toast(`${copies.length ? `${copies.length} copied, but ` : ""}${problems[0]}`, { err: true });
  toast(`${copies.length === 1 ? "Copy" : `${copies.length} copies`} made in ${file.replace(/\.html$/, "")}.`, { action: { label: "Undo", run: () => stepScreen(file, "undo") } });
}
/** An item dragged to another place of its list in the page. */
async function moveItemInScreen({ file, ordinal, prop, from, to }) {
  const r = await window.studio.jsxItem(file, [ordinal], prop, { type: "move", from, to }).catch((e) => ({ error: String(e?.message ?? e) }));
  if (r?.error) return toast(`The item was not moved: ${r.error}`, { err: true });
  markAfterReload(file, [{ ordinal, prop, index: to }]);
  toast(`Item ${from + 1} of ${prop} moved to place ${to + 1}.`, { action: { label: "Undo", run: () => stepScreen(file, "undo") } });
}
/** A new item after `after` of the list `prop`: a ready action in a list of actions, a copy of the item in any other list of objects. */
async function addItemInScreen({ file, ordinal, prop, after, ownerName }) {
  const action = listKind(prop, ownerName) === "action";
  const r = await (action ? window.studio.jsxItems(file, ordinal, prop, "add", undefined, newAction(), after + 1) : window.studio.jsxItems(file, ordinal, prop, "duplicate", [after])).catch((e) => ({ error: String(e?.message ?? e) }));
  if (r?.error) return toast(`The item was not added: ${r.error}`, { err: true });
  markAfterReload(file, [{ ordinal, prop, index: action ? r.added : r.copies[0] }]);
  toast(`Item added to ${prop}${action ? "" : " (a copy of the item)"}.`, { action: { label: "Undo", run: () => stepScreen(file, "undo") } });
}
/** A text changed in place on the screen (double click in the Edit mode): the file is changed where the text was written; what it cannot do goes to the agent. */
async function editTextInScreen({ file, ordinal, old, value }) {
  const r = await window.studio.jsxEditText(file, ordinal, old, value).catch((e) => ({ error: String(e?.message ?? e) }));
  if (r?.error) {
    canvas.reload(file); // the page shows the new text, the file does not have it
    return toast(r.error, { err: true, action: { label: "Ask the agent", run: () => askAgentToEditText({ file, ordinal, old, value, reason: r.error }) } });
  }
  markAfterReload(file, [ordinal]);
  toast(`Text changed in ${file.replace(/\.html$/, "")}.`, { action: { label: "Undo", run: () => stepScreen(file, "undo") } });
}
async function askAgentToEditText({ file, ordinal, old, value, reason }) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  const e = (await window.studio.jsxInspect(file, [ordinal]).catch(() => null))?.element;
  push({ kind: "user", text: `Change the text “${old}” to “${value}” in ${file}.` });
  setBusy(true); sentModel = $("model").value; setPlanPending(false);
  window.studio.send(`In ${file}, the component ${e ? `${e.name} (in the JSX: ${e.snippet})` : "the user edited"} shows the text “${old}”. The user changed it on the screen to “${value}” (the app could not do it itself: ${reason}). Change it where it comes from, in every language that has it if it is an LSI, and change nothing else.`, sentModel || undefined, { plan: false, economy });
}
/** Escape in the edit mode: first the marks go, then the mode. */
function escapeEdit() {
  if (chatPick || !marked.length) return setInspect(false);
  inspector.clearIn(canvas.all().map((f) => f.view)); resetMarked(); propsPanel.clear();
}
/** Components and list items taken out of the screen's file (Delete in the Edit mode, "Delete" of the panel). What the file does not let go can be given to the agent. */
async function deleteInScreen({ file, items }) {
  const label = (n) => (n ? n.replace(/^(Uu5|Plus4U5)\w*\./, "") : "component");
  const comps = items.filter((i) => !i.sub), nameOf = new Map(comps.map((i) => [i.ordinal, i.name]));
  let done = 0, firstBad = null;
  if (comps.length) {
    const r = await window.studio.jsxDelete(file, comps.map((i) => i.ordinal)).catch((e) => ({ error: String(e?.message ?? e) }));
    if (r?.error) return toast(r.error, { err: true });
    done += r.applied.length;
    if (r.failed?.length) firstBad = { name: nameOf.get(r.failed[0].ordinal), ordinal: r.failed[0].ordinal, reason: r.failed[0].reason };
  }
  for (const g of listGroups(items)) {
    const r = await window.studio.jsxItems(file, g.ordinal, g.prop, "remove", g.indexes).catch((e) => ({ error: String(e?.message ?? e) }));
    if (r?.error) firstBad ??= { name: `item of ${g.prop}`, ordinal: g.ordinal, reason: r.error }; else done += r.removed;
  }
  const what = done === 1 && items.length === 1 ? (items[0].sub ? "the item" : label(items[0].name)) : `${done} components or items`;
  if (done && !firstBad) return toast(`Removed ${what} from ${file.replace(/\.html$/, "")}.`, { action: { label: "Undo", run: () => stepScreen(file, "undo") } });
  if (firstBad) toast(`${done ? `Removed ${what}, but ` : ""}${label(firstBad.name)} was not removed: ${firstBad.reason}${/\.$/.test(firstBad.reason) ? "" : "."}`, { err: true, action: { label: "Ask the agent", run: () => askAgentToDelete({ file, name: firstBad.name, ordinal: firstBad.ordinal, reason: firstBad.reason }) } });
}
async function askAgentToDelete({ file, name, ordinal, reason }) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  const e = (await window.studio.jsxInspect(file, [ordinal]).catch(() => null))?.element;
  push({ kind: "user", text: `Remove ${name ?? "the component"} from ${file}.` });
  setBusy(true); sentModel = $("model").value; setPlanPending(false);
  window.studio.send(`In ${file}, remove the component ${e ? `${e.name} (in the JSX: ${e.snippet})` : name ?? "the user marked"} from the screen. The user deleted it on the screen (the app could not do it itself: ${reason}). Remove it cleanly, together with code that only it used, and change nothing else.`, sentModel || undefined, { plan: false, economy });
}
const inspector = createInspector({ onPick: showPick, onEscape: () => escapeEdit(), onMove: moveInScreen, onDelete: deleteInScreen, onDuplicate: duplicateInScreen, onText: editTextInScreen, onItemMove: moveItemInScreen });
const canvas = createCanvas({
  root: $("canvas"), world: $("world"), preloadUrl: () => webviewPreload, urlFor: (f, env) => `http://127.0.0.1:${port}/${encodeURIComponent(project)}/${encodeURIComponent(f)}${env ? `?env=${encodeURIComponent(env)}` : ""}`, getEnvs: () => (envInfo ? { ...envInfo, refresh: refreshEnvs } : null),
  onReady: (file, id) => window.studio.registerView(file, id),
  onDelete: (file) => deleteScreen(file),
  onFullscreen: (file) => toggleFullscreen(file),
  onComments: (file) => COMMENTS && comments.open({ screen: file }),
  onNavigate: (from, to) => { canvas.reload(from); canvas.focus(to); toast(`${from.replace(/\.html$/, "")} leads to ${to.replace(/\.html$/, "")}.`); }, // a link in a screen: show the screen it leads to, this one is put back
  onTemplate: (file) => saveAsTemplate(file),
  onRequestSize: askSize,
  onGone: (file) => { window.studio.unregisterView(file); renderTabs(); },
  onChange: (what) => { if (!mapZoom()) $("zval").textContent = canvas.zoomPercent() + "%"; if (what === "layout" || what === "move") flow?.draw(); if (what === "layout" || what === "move" || what === "camera") vlayer?.draw(); if (what === "layout") persistLayout(); },
  onNoteEdit: (f, id, t) => memory.noteEdited(f, id, t), onNoteBlur: (f, id, t) => memory.noteBlurred(f, id, t), onNoteDelete: (f, id) => memory.deleteNote(f, id),
  onContextMenu: (ev) => showContextMenu(ev),
  onDescClick: (file) => openDesc(file),
  onSelect: () => { renderTabs(); updateSelbar(); vlayer?.draw(); flow?.setFocus(flowHover ?? canvas?.selected()); syncMenuScreenState(); },
  onViewSwapped: (f, v) => v.addEventListener("console-message", (e) => inspector.handleConsole(f.file, e.message)), // the screen was rendered again in a new webview
  onPageReady: (f) => { lastScreenChange = Date.now(); const injected = inspector.injectIfOn(f.view), again = takePending(f.file); if (injected) Promise.resolve(injected).then(() => { inspector.setAnnotate([f.view], annotating); if (annotating) return repinScreen(f.file, f.view); }); if (again) Promise.resolve(injected).then(() => again.forEach((o, i) => (typeof o === "number" ? inspector.pickOrdinal(f.view, o, i > 0) : inspector.pickItem(f.view, o.ordinal, o.prop, o.index, i > 0)))); if (marked.some((m) => m.file === f.file)) { marked = marked.filter((m) => m.file !== f.file); if (activeMarked?.file === f.file) activeMarked = marked.at(-1) ?? null; renderMarked(); } }, // a reloaded page lost its frames
  getExtraRects: () => planCards?.rects() ?? [],
  getInset: () => canvasInset(),
});
/** What a fit must keep clear: the floating toolbar (Glass Effect) on top, a floating chat on its side of the canvas. */
function canvasInset() {
  const top = document.body.dataset.glass ? parseFloat(document.body.style.getPropertyValue("--glass-top")) || 0 : 0, out = { top, left: 0, right: 0 };
  if (document.body.dataset.chat !== "float") return out;
  const c = $("chat").getBoundingClientRect(), k = $("canvas").getBoundingClientRect();
  if (c.width < 40 || c.height < 40 || dock.collapsed()) return out; // hidden or collapsed to a bar
  if (c.left + c.width / 2 < k.left + k.width / 2) out.left = Math.max(0, c.right - k.left + 12); else out.right = Math.max(0, k.right - c.left + 12);
  return out;
}
// the plans of the project as cards on the canvas (plans/*.md)
planCards = createPlanCards({
  root: $("canvas"), world: $("world"), canvas,
  api: { read: (slug) => window.studio.plansRead(slug), write: (slug, text) => window.studio.plansWrite(slug, text) },
  ctx: { chatPlan: (slug) => entries.find((x) => x.kind === "plan" && x.planSlug === slug && x.state !== "superseded") ?? null, answersChanged: (e) => { paint(e); persist(); }, answersTyped: () => persist(), sendAnswers: (e) => answerPlan(e), saveSitemap: (sm) => { smUndone = false; return window.studio.sitemapWrite(sm).then((r) => { if (r?.error) toast(r.error, { err: true }); return r; }); }, restoreSitemap: async () => { const r = await window.studio.sitemapRestore(); if (r?.error) toast(r.error, { err: true }); return r; }, hasSitemap: () => Boolean(projectSitemap), isBusy: () => busy, sitemapOffered: () => mapOffered(), flowEdges: () => window.studio.flowEdges().catch(() => []), screens: () => canvas.files(), approve: (slug) => approvePlanFile(slug), askAgent: (slug, message, label) => revisePlanFromCard(message, label), createScreen: (o) => createScreenFromPage(o), createScreens: (o) => createScreensFromPages(o), adoptPlanMap: (slug) => adoptPlanMap(slug), showDetail: (name, host) => planCtx.showDetail(name, host), docsDescribe: (names) => window.studio.docsDescribe(names).catch(() => null), openScreen: (f) => canvas.get(f) && canvas.focus(f), isScreen: (f) => Boolean(canvas.get(f)), changed: () => { persistLayout(); syncEmptyForCards(); }, deletePlan: (slug, title) => deletePlan(slug, title), shareSitemap: (anchor, sm, collapsed, o) => openSitemapShare(anchor, sm, collapsed, o), toggleAnnotate: () => toggleAnnotate(), mapPins: (scope) => mapPins(scope), annotatePages: (o) => annotatePages(o), adoptComments: (scope, notes) => adoptMapComments(scope, notes), viewChanged: () => { plansMenu?.sync?.(); sitemapMenu?.sync?.(); syncZoomLabel(); syncViewSw(); }, zoomChanged: () => syncZoomLabel(), getInset: () => canvasInset() },
});
// the Plans menu of the toolbar: the sitemap and the plans of the project, to show, hide or make
let plansCache = [];
const menuState = () => ({
  sitemap: projectSitemap ? { pages: countScreens(projectSitemap.sitemap), portal: kindOf(projectSitemap.sitemap) === "portal", built: countBuilt(projectSitemap.sitemap, (f) => Boolean(canvas.get(f))), hidden: planCards.isHidden("@sitemap") } : null,
  plans: plansCache.map((p) => ({ ...p, hidden: planCards.isHidden(p.slug) })), screens: canvas.files().length, viewing: planCards.viewKey(), offered: mapOffered(),
});
const menuActions = {
  closeView: () => planCards.closeView(),
  toggleView: (key) => { if (planCards.viewKey() === key) planCards.closeView(); else planCards.openView(key); },
  arrange: () => { planCards.arrange(); canvas.fitAll(true); },
  show: (key) => { if (!planCards.openView(key)) toast("This plan has no card on the canvas. Open the plan file plans/" + key + ".md or delete the plan.", { err: true }); },
  remove: (slug, title) => deletePlan(slug, title),

  toggle: (key) => planCards.setHidden(key, !planCards.isHidden(key)),
  fromScreens: async () => {
    const edges = await window.studio.flowEdges().catch(() => []), sm = sitemapFromScreens({ screens: canvas.files(), edges: Array.isArray(edges) ? edges : [] });
    if (!sm) return;
    const r = await window.studio.sitemapWrite(sm); if (r?.error) return toast(r.error, { err: true });
    setProjectSitemap(r); planCards.focus("@sitemap");
  },
  empty: async () => {
    const r = await window.studio.sitemapWrite({ ...(projectLevel === "page" ? { kind: "portal" } : {}), root: { title: project || "Home", type: "page", children: [] } }); if (r?.error) return toast(r.error, { err: true });
    setProjectSitemap(r); planCards.focus("@sitemap");
  },
  fromLink: () => pickFromLink(),
  askAgent: () => { setPlanMode(true); const t = $("prompt"); t.value = "Propose the sitemap of the pages (a map of the web site or portal): "; t.focus(); t.setSelectionRange(t.value.length, t.value.length); },
};
/** A structure of pages picked from a link that waits for the next message to the agent ({ url, title, outline, count }), shown among the attachments. */
let sitePick = null;
/**
 * Sitemap from a link (sitePicker.js): the pages picked from a web site, a uuBookKit book or a uuManagementKit document / portal become the
 * sitemap of the project as they are, or wait as an attachment for the agent, which proposes the sitemap from them in Plan mode.
 */
function pickFromLink(url = "", card = false, preloaded = null) {
  if (!project) return;
  openSitePicker({
    toast, url, preloaded, replaces: Boolean(projectSitemap),
    onUse: async ({ sitemap }) => {
      if (!sitemap) return false;
      if (projectSitemap && !confirm("Replace the sitemap of the project with the picked pages? The current one is kept and can be restored.")) return false;
      const r = await window.studio.sitemapWrite(sitemap, { backup: true });
      if (!r || r.error) { toast(r?.error ?? "The sitemap could not be saved.", { err: true }); return false; }
      setProjectSitemap(r); planCards.focus("@sitemap");
    },
    onAgent: (pick) => {
      const t = $("prompt"), has = Boolean(projectSitemap);
      // nothing is sent yet: say so, the picker just closed
      toast(`${pick.count} page${pick.count === 1 ? "" : "s"} of “${pick.title}” ${pick.count === 1 ? "is" : "are"} attached to your next message. ${has ? "The agent will propose how to extend the sitemap with them" : "The agent will propose the sitemap from them"}: add what you want and send.`);
      if (card && docCards.setPick(url, pick)) { t.focus(); return; } // opened from the card of a pasted link: the pages stay on that card
      sitePick = pick; renderAttachments(); setPlanMode(true);
      if (!t.value.trim()) t.value = has ? `Go through the attached pages of “${pick.title}” and propose how to extend the sitemap of the project with them: ` : `Propose the sitemap of the pages from the attached structure of “${pick.title}”: `;
      t.focus(); t.setSelectionRange(t.value.length, t.value.length);
    },
  });
}
/** The card of a picked structure among the attachments (of the chat or of the dashboard). */
function sitePickCard(pick, remove) {
  const d = Object.assign(document.createElement("div"), { className: "att doc ready sitepick-att", title: pick.url });
  const mk = (cls, text) => Object.assign(document.createElement("div"), { className: cls, textContent: text });
  d.append(Object.assign(document.createElement("button"), { type: "button", className: "x", textContent: "✕", title: "Do not use these pages", onclick: remove }),
    mk("doc-k", pick.sitemap ? "Sitemap from a link" : "Pages for the agent"), mk("doc-t", pick.title), mk("doc-s", `${pick.count} page${pick.count === 1 ? "" : "s"} · ${pick.sitemap ? "becomes the sitemap of the project" : "input of the sitemap plan"}`));
  return d;
}
const plansMenu = createPlansMenu({ button: $("plansbtn"), menu: $("plansmenu"), state: menuState, actions: menuActions, show: "plans" });
const sitemapMenu = createPlansMenu({ button: $("mapbtn"), menu: $("mapmenu"), state: menuState, actions: menuActions, show: "sitemap" });
window.studio.onPlansChanged(({ project: p, plans }) => { if (p === project) onPlansChanged(plans); });
window.studio.onSitemapChanged(({ project: p, sitemap, hasPrev }) => { if (p === project) setProjectSitemap(sitemap ? { sitemap, hasPrev } : null); });
function syncFrames(screens) {
  const added = [];
  for (const f of screens) if (!canvas.get(f)) {
    added.push(f);
    const fr = canvas.addFrame(f, savedLayout[f] ?? (defaultEnv ? { env: defaultEnv } : undefined));
    fr.view.addEventListener("console-message", (e) => inspector.handleConsole(f, e.message));
  }
  for (const f of canvas.files()) if (!screens.includes(f)) canvas.removeFrame(f);
  for (const f of added) { const v = !savedLayout[f] && variantInfo(f, canvas.files()); if (v) vlayer?.arrange(v.base); } // new variants are put in a row below their original
  planCards?.refresh(); $("empty").hidden = screens.length > 0;
  // the Edit mode edits the screens: with none on the canvas there is nothing to edit
  $("inspect").hidden = screens.length === 0; if (screens.length === 0 && inspector.on) setInspect(false); renderTabs(); desc?.refreshScreens(); vlayer?.draw(); if (flow) updateFlowBtn();
}
function renderTabs() {
  const keep = $("tabs").scrollLeft; // replaceChildren would reset the strip to the left
  $("tabs").replaceChildren(...canvas.files().map((s) => {
    const t = Object.assign(document.createElement("div"), { className: `tab${s === canvas.selected() ? " on" : ""}${s === workFile ? " working" : ""}`, title: s });
    t.append(Object.assign(document.createElement("span"), { textContent: s.replace(".html", "") }));
    t.onclick = () => canvas.focus(s); return t;
  }));
  $("tabs").scrollLeft = keep;
  $("tabs").querySelector(".tab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
// a mouse wheel scrolls the tab strip sideways (trackpads already send horizontal deltas)
$("tabs").addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); $("tabs").scrollLeft += e.deltaY; } }, { passive: false });
/** Notes on a whole map that older versions kept unsent (per project and map): once, they become the annotation of the whole map in the message being written. */
function takeOldMapNotes() {
  const pre = `uu5studio.mapnotes:${project}:`;
  try {
    for (const k of Object.keys(localStorage).filter((x) => x.startsWith(pre))) {
      let l = []; try { l = JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { /* unreadable */ }
      localStorage.removeItem(k);
      const notes = Array.isArray(l) ? l.filter((t) => typeof t === "string" && t.trim()) : [], key = k.slice(pre.length);
      if (notes.length) adoptMapComments(key === "null" || key === "undefined" ? "project" : key, [{ id: MAP_WHOLE, where: "the whole map", type: "map", note: notes.join("; ") }]);
    }
  } catch { /* no storage */ }
}
/** The sitemap as a picture to share: "png" and "svg" are saved (dialog), "copy" puts the PNG on the clipboard. */
// The Share panel of the sitemap, like the Share menu of a screen: WHAT goes out (Image, SVG, uu5String), then WHAT TO DO with it (Copy, Save…,
// and Publish for the uu5String of the sitemap of the project while signed in to Plus4U). The chosen format is remembered.
const SM_FORMATS = () => [ // a function: OUT_FORMATS and fmtIcon are defined further down
  { id: "png", label: "Image", hint: "The map as a picture, as it is shown (folded branches stay folded).", icon: OUT_FORMATS[0].icon, copy: "copy", save: "png" },
  { id: "svg", label: "SVG", hint: "The map as a vector picture: sharp at any size, for a presentation or a print.", icon: fmtIcon('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>'), copy: "svgcopy", save: "svg" },
  { id: "uu5", label: "uu5String", hint: "A Uu5TreeBricks.Tree to paste into a document (uuBookKit, uuManagementKit).", icon: OUT_FORMATS[2].icon, copy: "uu5copy", save: "uu5file" },
];
const SM_KEY = "uu5studio.sitemapShareFormat";
function openSitemapShare(anchor, sm, collapsed, { project = false } = {}) {
  const old = document.querySelector(".sm-share"); old?.remove();
  if (old?.dataset.for === "1" && old.anchor === anchor) return; // a second click closes it
  let fmt = (() => { try { return SM_FORMATS().some((f) => f.id === localStorage.getItem(SM_KEY)) ? localStorage.getItem(SM_KEY) : "png"; } catch { return "png"; } })();
  const m = Object.assign(document.createElement("div"), { className: "fmt fmt-panel sm-share" });
  m.dataset.for = "1"; m.anchor = anchor; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Share the sitemap");
  const close = () => { m.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", escKey, true); };
  const away = (e) => { if (!m.contains(e.target) && e.target !== anchor) close(); }, escKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const btn = (cls, html, title, fn) => { const b = Object.assign(document.createElement("button"), { type: "button", className: cls, title }); b.innerHTML = html; b.onclick = (ev) => { ev.stopPropagation(); fn(); }; return b; };
  const render = () => {
    const formats = SM_FORMATS(), f = formats.find((x) => x.id === fmt) ?? formats[0];
    const tiles = Object.assign(document.createElement("div"), { className: "fmt-tiles smsh-tiles", role: "radiogroup", ariaLabel: "What to share" });
    tiles.append(...formats.map((x) => { const t = btn(`fmt-tile${x.id === f.id ? " on" : ""}`, `${x.icon}<span>${esc(x.label)}</span>`, x.hint, () => { fmt = x.id; try { localStorage.setItem(SM_KEY, x.id); } catch { /* not remembered */ } render(); }); t.role = "radio"; t.ariaChecked = String(x.id === f.id); return t; }));
    const hint = Object.assign(document.createElement("p"), { className: "fmt-hint", textContent: f.hint });
    const acts = Object.assign(document.createElement("div"), { className: "fmt-acts smsh-acts" });
    acts.append(...OUT_ACTS.map(([k, label, icon]) => btn(k === "copy" ? "primary" : "", `${icon}<span>${esc(label)}</span>`, `${label.replace("…", "")}: ${f.label}`, () => { close(); exportSitemapAs(f[k], sm, collapsed); })));
    let pubTo = null;
    if (f.id === "uu5" && project && p4uOn) { // Publish: like the uu5String of a screen, one click to where it went last, the caret for another page or document
      const content = () => sitemapUu5String(sm, { collapsed }) || null;
      const split = Object.assign(document.createElement("div"), { className: "fmt-split" });
      const pub = btn("", `${ICONS.doc}<span>Publish…</span>`, "Publish the sitemap onto a page of a Plus4U document", () => { close(); plus4uSync.publishSitemap({ content: content() }); });
      split.append(pub); acts.append(split);
      pubTo = Object.assign(document.createElement("p"), { className: "fmt-hint fmt-pubto", hidden: true });
      plus4uSync.sitemapTarget().then((t) => {
        if (!t || !split.isConnected) return;
        pub.querySelector("span").textContent = "Publish";
        pub.title = `Publish again to “${t.pageName || "the page"}” of “${t.documentName || "the document"}” (overwrites what was published there)`;
        pub.onclick = (ev) => { ev.stopPropagation(); close(); plus4uSync.publishSitemap({ content: content(), quick: true }); };
        const more = btn("fmt-caret", '<svg class="zcar" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>', "Choose another page or document…", () => { close(); plus4uSync.publishSitemap({ content: content() }); });
        more.setAttribute("aria-label", "Choose another page or document");
        split.append(more);
        pubTo.textContent = `Publish → “${t.pageName || "page"}” · ${t.documentName || "document"}`; pubTo.hidden = false;
      });
    }
    m.replaceChildren(tiles, hint, document.createElement("hr"), acts, ...(pubTo ? [pubTo] : []));
  };
  render(); document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = `${Math.max(6, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 6))}px`; m.style.top = `${r.bottom + 6}px`;
  document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", escKey, true);
  m.querySelector(".fmt-tile.on")?.focus();
}
async function exportSitemapAs(kind, sm, collapsed) {
  if (kind === "uu5copy" || kind === "uu5file") { // the map as a uu5string with Uu5TreeBricks.Tree
    const text = sitemapUu5String(sm, { collapsed });
    if (!text) return toast("There is no sitemap to export.", { err: true });
    if (kind === "uu5copy") { try { await navigator.clipboard.writeText(text); toast("The sitemap is on the clipboard as a uu5string."); } catch { toast("The clipboard is not available.", { err: true }); } return; }
    const r = await window.studio.exportData({ name: `${project || "project"}-sitemap-uu5string`, ext: "txt", text }); if (r?.error) toast(r.error, { err: true }); else if (r?.path) toast(`Saved ${r.path.split("/").pop()}.`);
    return;
  }
  const { svg, width, height } = sitemapSvg(sm, { isScreen: (f) => Boolean(canvas.get(f)), collapsed }); // as it is shown: the folded branches stay folded
  if (!svg) return toast("There is no sitemap to export.", { err: true });
  const base = `${project || "project"}-sitemap`;
  if (kind === "svgcopy") { try { await navigator.clipboard.writeText(svg); toast("The sitemap is on the clipboard as SVG."); } catch { toast("The clipboard is not available.", { err: true }); } return; }
  if (kind === "svg") { const r = await window.studio.exportData({ name: base, ext: "svg", text: svg }); if (r?.error) toast(r.error, { err: true }); else if (r?.path) toast(`Saved ${r.path.split("/").pop()}.`); return; }
  const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try { await img.decode(); } catch { return toast("The picture could not be made.", { err: true }); }
  const k = Math.min(2, 8000 / Math.max(width, height)), cv = document.createElement("canvas"); cv.width = Math.round(width * k); cv.height = Math.round(height * k);
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
  const base64 = cv.toDataURL("image/png").split(",")[1];
  if (kind === "copy") {
    const r = await window.studio.copyImage(base64).catch((e) => ({ error: /No handler/i.test(String(e?.message)) ? "Restart the app: it was started before this feature was added." : String(e?.message ?? e) }));
    return r?.error ? toast(r.error, { err: true }) : toast("The sitemap is on the clipboard as a picture.");
  }
  const r = await window.studio.exportData({ name: base, ext: "png", base64 }); if (r?.error) toast(r.error, { err: true }); else if (r?.path) toast(`Saved ${r.path.split("/").pop()}.`);
}
/** Delete a plan: the same dialog as for a screen; the file goes to the trash. */
async function deletePlan(slug, title) {
  const ok = await askConfirm({ title: `Delete the plan “${title}”?`, detail: `The file plans/${slug}.md will be removed from the project “${project}”. It is moved to the trash, so you can restore it.`, ok: "Delete" });
  if (!ok) return;
  const r = await window.studio.plansRemove(slug);
  if (r?.error) toast(r.error, { err: true }); else toast(`The plan “${title}” was deleted (the file is in the trash).`);
}
async function deleteScreen(file) {
  const name = file.replace(/\.html$/, "");
  const info = await window.studio.screenDeleteInfo(file).catch(() => null);
  const also = info ? [info.rules ? `${info.rules} business rule${info.rules === 1 ? "" : "s"}` : "", info.description ? "its description" : "", info.notes ? `${info.notes} note${info.notes === 1 ? "" : "s"}` : "", info.sitemap ? `${info.sitemap === 1 ? "its page" : `${info.sitemap} pages`} in the sitemap (sub-pages move up)` : ""].filter(Boolean) : [];
  const ok = await askConfirm({ title: `Delete the screen “${name}”?`, detail: `The file ${file} will be removed from the project “${project}”. It is moved to the trash, so you can restore it.${also.length ? ` What belongs to the screen goes with it: ${also.join(", ")}. The rules and the description are copied to .studio/removed-screen-memory.md in the project, so they can be restored by hand.` : ""}${info?.sitemap ? " The sitemap as it was before is kept as its previous version." : ""}`, ok: "Delete screen" });
  if (!ok) return;
  const r = await window.studio.deleteScreen(file);
  if (r?.canceled) return;
  if (r?.error) toast(r.error, { err: true }); else { toast(`The screen ${file.replace(".html", "")} was deleted (the file is in the trash${r?.rules ? `; ${r.rules} rule${r.rules === 1 ? "" : "s"} removed` : ""}${r?.sitemap ? `; removed from the sitemap` : ""}).`); rules?.reload?.(); }
}
window.studio.onNavigated((file) => { if (canvas.get(file)) canvas.focus(file); });
window.studio.onPreviewChanged(({ project: p, screens, changed }) => {
  if (p !== project) return;
  const fresh = screens.filter((f) => !canvas.get(f));
  syncFrames(screens);
  flow?.refresh();
  for (const f of changed) if (!fresh.includes(f)) canvas.reload(f);
  for (const f of changed) propsPanel.refresh(f); // the inspector re-reads the picked component (or clears when it is gone)
  if (fsFile && changed.includes(fsFile)) { fsFreeze?.cover(); fsView?.reload(); }
  if (fsFile && !screens.includes(fsFile)) closeFullscreen();
  if (fresh.length) canvas.focus(fresh[fresh.length - 1]);
  syncMenuScreenState(); // a variant may have appeared or gone
  p4uLocalSoon(); // the project may now differ from what was uploaded
});
// while a map is the view (instead of the canvas), the zoom of the toolbar and ⌘ + / − / 0 zoom the map
function mapZoom() { return planCards?.mapZoom?.() ?? null; }
function syncZoomLabel() {
  const m = mapZoom();
  $("zval").textContent = `${m ? m.percent() : canvas.zoomPercent()}%`;
  $("fit").textContent = m ? "Fit the map" : "Fit all screens";
}
$("zin").onclick = () => { const m = mapZoom(); if (m) { m.by(1.25); syncZoomLabel(); } else canvas.zoomBy(1.25); };
$("zout").onclick = () => { const m = mapZoom(); if (m) { m.by(0.8); syncZoomLabel(); } else canvas.zoomBy(0.8); };
$("z100").onclick = () => { const m = mapZoom(); if (m) { m.reset(); syncZoomLabel(); } else canvas.zoom100(); };
$("fit").onclick = () => { const m = mapZoom(); if (m) { m.fit(); syncZoomLabel(); } else canvas.fitAll(true); };
// one pill: the percentage opens a small menu (zoom in / out, 100 %, fit)
{
  const menu = $("zmenu"), pill = $("zpct");
  const setOpen = (on) => { menu.hidden = !on; pill.setAttribute("aria-expanded", String(on)); };
  pill.onclick = (e) => { e.stopPropagation(); const willOpen = menu.hidden; dismissMenus(); setOpen(willOpen); };
  menu.addEventListener("click", (e) => { if (e.target.closest("#zin,#zout")) return; setOpen(false); }); // + / − stay open so they can be repeated
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !e.target.closest("#zoompill")) setOpen(false); }, true); // capture: the cards of the canvas stop the event on their way up
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setOpen(false); e.stopPropagation(); } }, true);
}
// every dialog closes with the same cross in its header; in the static ones it does what their Cancel / Close button does
for (const [box, btn] of [["sizebox", "sz-cancel"], ["confirm", "cf-cancel"], ["dialog", "dlg-cancel"], ["jsonbox", "jb-cancel"], ["setup", "setup-close"]]) addDialogClose($(box).firstElementChild, () => $(btn).click());
// Escape closes the topmost open dialog even when the focus is not inside it (after a click on its background or text, or on a button that
// has gone). With the focus inside, the dialog's own handler does it (some, like the first-run setup, deliberately refuse).
const MODALS = ["confirm", "jsonbox", "iconbox", "dialog", "structbox", "sizebox", "tour", "libbox", "actbox", "setup", "about", "descdlg", "rules", "tplbox", "rolebox", "imgenbox", "guidebox", "cmtbox", "varbox", "branddlg", "setbox"]; // topmost first
addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const open = [...[...document.querySelectorAll(".docprev, .tsdbox")].reverse(), ...MODALS.map((id) => $(id))].filter((m) => m && !m.hidden);
  const top = escapeTarget(open, e.target); // the focus is in the topmost dialog: its own handler closes it; elsewhere (also in a dialog below it, a question asked over it) the topmost closes
  if (!top) return;
  e.preventDefault(); e.stopPropagation();
  top.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
}, true);
addEventListener("keydown", (e) => {
  if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") || ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.target.matches("textarea,input,select"))) { e.preventDefault(); toggleFullscreen(canvas.selected()); return; }
  if (fsFile || confirmOpen) return;
  if (e.target.matches("textarea,input,select")) return;
  if ((e.metaKey || e.ctrlKey) && e.key === "0") { e.preventDefault(); $("fit").click(); }
  else if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); $("zin").click(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === "-") { e.preventDefault(); $("zout").click(); }
  else if (e.key === "i" && !e.metaKey && !e.ctrlKey) setInspect(!inspector.on);
  else if (e.key === "a" && !e.metaKey && !e.ctrlKey && !e.altKey) toggleAnnotate();
  else if (inspector.on && !chatPick && marked.length && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); if (!copyRefused(marked)) for (const g of markedByFile()) deleteInScreen(g); }
  else if (inspector.on && !chatPick && marked.length && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") { e.preventDefault(); if (!copyRefused(marked)) for (const g of markedByFile()) duplicateInScreen(g); }
  else if ((e.key === "Delete" || e.key === "Backspace") && canvas.selected() && !inspector.on) { e.preventDefault(); deleteScreen(canvas.selected()); }
  else if (e.key === "Escape") { if (inspector.on) escapeEdit(); else canvas.select(null); }
});

// ---------- inspector ----------
// chat mode: the picker works without the side panel; every click adds the component to the message being written
let chatPick = false; // the Annotate mode (the chat's way to point at components; the Edit mode is the other way to pick them)
// the Annotate mode: a click on a component of a screen (or on a page of a sitemap) asks for a note; the place gets a number and the note goes with the next message
let annotating = false;
function setInspect(v, { chat = false, annotate = false } = {}) {
  chatPick = v && (chat || annotate);
  const was = annotating; annotating = chatPick;
  const views = canvas.all().map((f) => f.view);
  inspector.set(v, views); canvas.setInspecting(v); canvas.setEditing(v && !chatPick);
  // the numbers of the annotations are on the components only in the Annotate mode, where a click on one opens its notes;
  // another mode (Edit, picking components) starts without them (the chips keep the annotations)
  if (v) { inspector.setAnnotate(views, annotating); if (annotating) for (const f of canvas.all()) repinScreen(f.file, f.view); else if (was) inspector.clearIn(views); }
  if (!annotating) annotatePopover.close();
  planCards?.setAnnotating?.(annotating);
  for (const b of document.querySelectorAll("[data-annotate]")) { b.classList.toggle("on", annotating); b.setAttribute("aria-pressed", String(annotating)); }
  $("inspect").classList.toggle("on", v && !chatPick); $("railsel").classList.toggle("on", !(v && !chatPick)); $("seledit").classList.toggle("on", v && !chatPick);
  // the side panel keeps its tab: the Edit mode does not switch the chat to the Components catalogue (the user opens it to drag a component in)
  $("inspector").hidden = !v || chatPick; $("pickhint").hidden = !chatPick;
  if (!v || chatPick) { propsPanel.clear(); resetMarked(); }
}
$("inspect").onclick = () => setInspect(!inspector.on || chatPick);
$("railsel").onclick = () => { if (inspector.on && !chatPick) setInspect(false); }; // the tool rail of the canvas: Select leaves the Edit mode
const inspectedFile = () => propsPanel.file ?? activeMarked?.file ?? canvas.selected() ?? null; // the screen the user works with (undo falls back to the last change in the project)
$("insp-close").onclick = () => { structFrom = null; $("insp-back").hidden = true; setInspect(false); };
/** The Annotate mode on or off (the buttons in the chat, on the bar of a screen and on the toolbar of the map, the A key). */
function toggleAnnotate(v = !annotating) { if (!project) return; setInspect(v, { chat: true, annotate: true }); }
for (const b of document.querySelectorAll("[data-annotate]")) b.onclick = () => toggleAnnotate();
const iconPicker = createIconPicker({ getCatalog: () => window.studio.iconCatalog(), getBml: () => window.studio.uuBml(), getMdi: () => window.studio.iconsMdi() });
// the list of actions (actionList, itemList of ActionGroup, …) of the picked component, in a window
const actionListEditor = createActionListEditor({ api: {
  list: window.studio.jsxList, item: window.studio.jsxItem, setText: window.studio.jsxSetText, set: window.studio.jsxSet, remove: window.studio.jsxRemove,
  buttonDoc: () => window.studio.docsDetail("Uu5Elements.Button"), pickIcon: (o) => iconPicker.pick(o), ensureIconFonts: (b) => iconPicker.ensureFonts(b),
} });
const propsPanel = createPropsPanel({
  getScreens: () => canvas.files(),
  api: { markLevel: (file, i, item) => { const v = viewOfFile(file); if (v) inspector.markLevel(v, i, item); }, editList: (o) => actionListEditor.open(o), setText: window.studio.jsxSetText, pickIcon: (o) => iconPicker.pick(o), ensureIconFonts: (b) => iconPicker.ensureFonts(b), ensureBmlFonts: () => iconPicker.ensureBmlFonts(), setBranch: window.studio.jsxSetBranch, inspect: window.studio.jsxInspect, set: window.studio.jsxSet, remove: window.studio.jsxRemove, openExternal: window.studio.openExternal },
  onUse: (p) => { if (marked.length > 1) return useMarked(); addChip(p); $("prompt").focus(); },
  onComment: (on) => COMMENTS && comments.open({ on }),
  onStructure: (p) => structureDialog.open(p.file, { ordinal: p.ordinal, name: p.name }),
  onDelete: (p) => copyRefused([p]) || deleteInScreen({ file: p.file, items: [{ ordinal: p.ordinal, name: p.name, sub: p.sub ?? null }] }),
  onDuplicate: (p) => copyRefused([p]) || duplicateInScreen({ file: p.file, items: [{ ordinal: p.ordinal, name: p.name, sub: p.sub ?? null }] }),
  onCopyUu5: (p) => copyUu5Components(p),
  onAddItem: (p) => addItemInScreen({ file: p.file, ordinal: p.ordinal, prop: p.sub.prop, after: p.sub.index, ownerName: p.ownerName }),
});
let structFrom = null; // the screen whose structure the inspector was opened from (for the way back)
const structureDialog = createStructureDialog({ api: {
  structure: window.studio.jsxStructure,
  focus: () => window.studio.componentFocus(), // a screen made from an existing component: its tree starts at that component
  baseline: () => window.studio.componentBaseline(), reread: () => window.studio.componentReread(), toast: (t) => toast(t),
  show: (file, ordinal, part) => { structFrom = { file, part: part ?? null }; $("insp-back").hidden = false; if (!$("inspect").classList.contains("on")) $("inspect").click(); propsPanel.show({ file, chain: [ordinal] }); },
  /**
   * The moves the file can take safely are done in the file at once, so the screen on the canvas is the preview; the bar asks to keep or to undo them.
   * What cannot be moved there goes to the agent only after "Keep".
   */
  regenerate: async (file, original, tree, ops, part) => {
    if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
    const name = file.replace(/\.html$/, "");
    const r = await window.studio.jsxMoves(file, ops ?? []).catch((e) => ({ error: String(e?.message ?? e) }));
    if (r?.error) return toast(r.error, { err: true });
    const failed = r.failed ?? [], done = r.applied.length;
    if (!done && !failed.length) return;
    let message = null;
    if (failed.length) {
      const current = done ? normalizeTree(r.structure) ?? original : original;
      const notes = failed.map((f) => `${f.reason} (move ${f.index + 1}: ${ops[f.index]?.name ?? "?"} ${ops[f.index]?.position ?? ""} ${ops[f.index]?.targetName ?? ""})`.replace(/\s+\)/, ")"));
      message = regenerateMessage({ file, original: current, tree, notes, part: part?.name ?? null });
    }
    showPreviewBar({ file, name, done, failed, message });
  },
  plan: (file) => { setPlanMode(true); const t = $("prompt"); t.value = `Change @${file.replace(/\.html$/, "")}: `; t.focus(); t.setSelectionRange(t.value.length, t.value.length); },
} });
window.__structure = structureDialog;
$("insp-back").onclick = () => { const f = structFrom; $("insp-back").hidden = true; structFrom = null; if (f) structureDialog.open(f.file, f.part); };
window.__propsPanel = propsPanel; // the automated checks open the panel for a component through this
/** The chat chip of a pick: names and the source of the component from the file (an item of a list falls back to the whole component). */
async function chipFrom(p) {
  let r = await window.studio.jsxInspect(p.file, p.chain, p.sub), sub = p.sub;
  if (r?.error && p.sub) { sub = null; r = await window.studio.jsxInspect(p.file, p.chain, null); }
  if (r?.error) return { error: r.error };
  return { chip: { ...p, chain: r.chain, element: r.element, sub: r.element.item ? sub : null, pickKey: p.key ?? null } }; // pickKey: which item of a list was clicked, also when the file cannot show the item and the chip falls back to the whole component
}
// components marked in the inspector (Shift / Cmd / Ctrl + click adds or removes one); "Use in chat" takes all of them
let marked = [], activeMarked = null;
const viewOfFile = (file) => canvas.get(file)?.view;
function renderMarked() {
  const list = $("insp-sel-list");
  $("insp-sel").hidden = marked.length < 2;
  $("insp-use").textContent = marked.length > 1 ? `Use ${marked.length} in chat` : "Use in chat";
  $("insp-sel-head").textContent = `${marked.length} components marked`;
  list.replaceChildren(...marked.map((m) => {
    const label = m.label ?? describePick(m), t = Object.assign(document.createElement("span"), { textContent: label, title: label });
    const x = Object.assign(document.createElement("button"), { type: "button", title: "Unmark", textContent: "✕", onclick: (e) => { e.stopPropagation(); unmark(m); } });
    const chip = Object.assign(document.createElement("div"), { className: `chip${m === activeMarked ? " on" : ""}`, onclick: () => { activeMarked = m; renderMarked(); propsPanel.show(m); } });
    chip.append(t, x); return chip;
  }));
}
function unmark(m) {
  marked = marked.filter((x) => x !== m); inspector.drop(viewOfFile(m.file), m.key);
  if (activeMarked === m) { activeMarked = marked.at(-1) ?? null; if (activeMarked) propsPanel.show(activeMarked); else propsPanel.clear(); }
  renderMarked();
}
function resetMarked() { marked = []; activeMarked = null; renderMarked(); }
async function showPick(p) {
  structFrom = null; $("insp-back").hidden = true;
  if (chatPick) return annotateScreenPick(p); // the Annotate mode: a note on the component, or a link to it in the text
  const r = updateSelection(marked, p);
  marked = r.selection; activeMarked = r.active;
  if (r.clearFiles.length) inspector.clearIn(r.clearFiles.map(viewOfFile).filter(Boolean)); // a plain click marks only this one, also across screens
  if (r.refused) { inspector.drop(viewOfFile(r.refused.file), r.refused.key); toast(`At most ${MAX_MARKED} components can be marked at once.`); }
  renderMarked();
  if (r.active && !r.active.label) chipFrom(r.active).then((c) => { if (c.chip) { r.active.label = describePick(c.chip); renderMarked(); } }); // names of the component from the file
  if (r.active) return propsPanel.show(r.active);
  propsPanel.clear();
}
/** "Use N in chat": every marked component becomes a chip of the message being written. */
async function useMarked() {
  let added = 0, skipped = 0;
  for (const m of marked) { const c = await chipFrom(m); if (!c.error && addChip(c.chip, { quiet: true })) added++; else skipped++; }
  toast(added ? `${added} component${added > 1 ? "s" : ""} added to the message${skipped ? ` (${skipped} already there or not possible)` : ""}.` : "Those components are already in the message.");
  $("prompt").focus();
}
// components picked for the message being written (several can be added) and annotations: picks with a note, of screens and of sitemaps (annotations.js)
let chips = [];
const MAX_CHIPS = MAX_ANNOTATIONS;
const chipKey = (p) => annotationKey(p);
const isNote = (c) => c.note != null;
function renderChips() {
  const box = $("chips"); box.hidden = !chips.length; box.replaceChildren();
  // one look for all: the number, then the note (or that the place is linked in the text as [#n]) and what the place is
  chips.forEach((c) => {
    const label = describeAnnotation(c), note = isNote(c);
    const x = Object.assign(document.createElement("button"), { type: "button", title: note ? "Remove the annotation" : "Remove (and its link in the text)", textContent: "✕", onclick: (e) => { e.stopPropagation(); removeChip(c); } });
    const chip = Object.assign(document.createElement("div"), { className: `chip showable anno${note ? "" : " link"}${c.gone ? " gone" : ""}`, onclick: () => (note ? editAnnotation(c) : c.kind === "sitemap" ? planCards.revealPage?.(c.scope, c.id) : showChip(c)) });
    const num = Object.assign(document.createElement("b"), { className: "anno-n", textContent: String(c.ref) });
    const body = Object.assign(document.createElement("span"), { className: "anno-body" });
    body.append(Object.assign(document.createElement("span"), { className: "anno-note", textContent: note ? c.note || "(no note)" : `[#${c.ref}] in your text` }), Object.assign(document.createElement("span"), { className: "anno-what", textContent: c.gone ? `${label} · not on the screen any more` : label }));
    chip.title = note ? `${c.note}\n${label}\nClick to show it and edit the note` : `${label}\nLinked in your text as [#${c.ref}]. Click to show it in the ${c.kind === "sitemap" ? "map" : "screen"}`;
    chip.append(num, ...(c.thumb ? [Object.assign(document.createElement("img"), { src: c.thumb, alt: "" })] : []), body, x);
    box.append(chip);
  });
}
function removeChip(c) {
  removeRef(c);
  chips = chips.filter((x) => x !== c);
  afterRemoval([c]);
}
/**
 * Places left the message: the others are numbered 1…n again (no gaps; the links [#n] in the text follow), the chips are drawn again
 * and the numbers on the screens and on the map follow; a component without notes or links loses its frame.
 */
function afterRemoval(gone) {
  const map = renumbering(chips.map((c) => c.ref));
  chipSeq = chips.length;
  if (map.size) {
    const t = $("prompt"), at = t.selectionStart, before = t.value;
    t.value = renumberText(before, map);
    if (t.value !== before) t.setSelectionRange(Math.min(at, t.value.length), Math.min(at, t.value.length));
    for (const c of chips) c.ref = map.get(c.ref) ?? c.ref;
  }
  renderChips();
  if ([...gone, ...chips].some((c) => c.kind === "sitemap")) planCards.repaint?.();
  const places = new Map(); for (const c of [...gone, ...(map.size ? chips : [])]) if (c.kind !== "sitemap" && c.key) places.set(`${c.file}|${c.key}`, c);
  for (const c of places.values()) { if (annotating) relabelScreen(c); else if (gone.includes(c)) dropMark(c); }
}
/** A click on a chip: the screen of the component comes into view and the component is framed for a moment. */
async function showChip(c) {
  const f = c.file && canvas.get(c.file), ord = c.chain?.[0]; if (!f) return false;
  if (planCards.viewKey?.()) planCards.closeView();
  canvas.focus(c.file);
  await new Promise((r) => setTimeout(r, 450)); // the screen is moved into view first
  const ok = await f.view.executeJavaScript(flashCode(typeof ord === "object" ? ord.ordinal : ord, c.inst?.nth ?? null)).catch(() => false);
  if (!ok) toast("That component is not on the screen any more.");
  return Boolean(ok);
}
function addChip(p, { quiet = false } = {}) {
  if (!isNote(p) && chips.some((c) => chipKey(c) === chipKey(p))) { if (!quiet) toast("That component is already in the message."); return false; }
  if (chips.length >= MAX_CHIPS) { if (!quiet) toast(`At most ${MAX_CHIPS} components and annotations per message.`); return false; }
  p.ref = ++chipSeq; chips.push(p); if (!isNote(p)) insertRef(p); renderChips(); return true;
}
function clearChips() {
  const hadMap = chips.some((c) => c.kind === "sitemap");
  if (annotating) for (const c of chips) dropMark(c);
  chips = []; chipSeq = 0; renderChips();
  if (hadMap) planCards.repaint?.();
}

// ----- annotations: a note on a component of a screen or on a page of a sitemap
const annotatePopover = createAnnotatePopover();
/** Where a component of a screen is in the window: its box in the page (from the pick), scaled with the canvas. */
function screenAnchor(file, rect) {
  const v = viewOfFile(file); if (!v?.isConnected || !rect) return null;
  const vr = v.getBoundingClientRect(); if (!vr.width) return null;
  const k = vr.width / (v.offsetWidth || vr.width);
  const left = vr.left + rect.x * k, top = vr.top + rect.y * k;
  return { left, top, right: left + rect.w * k, bottom: top + rect.h * k };
}
/** A picture of the component as it is now (with a margin), small enough for the chat: { shot: { mime, data }, thumb } or {}. */
async function captureScreenPart(file, rect, view) {
  const v = viewOfFile(file), r = captureRect(rect, view); if (!v || !r) return {};
  try {
    const img = await Promise.race([v.capturePage(r), new Promise((res) => setTimeout(() => res(null), 2500))]);
    if (!img || img.isEmpty?.()) return {};
    const url = img.toDataURL(), el = new Image(); el.src = url; await el.decode();
    const k = Math.min(1, 96 / el.naturalHeight, 160 / el.naturalWidth), cv = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(el.naturalWidth * k)), height: Math.max(1, Math.round(el.naturalHeight * k)) });
    cv.getContext("2d").drawImage(el, 0, 0, cv.width, cv.height);
    return { shot: { mime: "image/png", data: url.slice(url.indexOf(",") + 1) }, thumb: cv.toDataURL("image/png") };
  } catch { return {}; }
}
/** The numbers of the notes of a component on its frame in the page ("1, 3"); without notes the frame goes. */
function relabelScreen(a) {
  const v = viewOfFile(a.file); if (!v || !a.key || !annotating) return; // outside the Annotate mode the page shows no numbers
  const refs = chips.filter((x) => x.kind !== "sitemap" && x.file === a.file && x.key === a.key).map((x) => x.ref); // its notes and its link in the text
  if (refs.length) inspector.label(v, a.key, refs.join(",")); else inspector.drop(v, a.key);
}
/**
 * A component of a screen clicked in the Annotate mode: a note on it. A component that has notes lists them in the popover:
 * a click on one edits it, the field adds another note (each note is an annotation with its own number).
 */
async function annotateScreenPick(p) {
  const c = await chipFrom(p);
  if (c.error) { inspector.drop(viewOfFile(p.file), p.key); return toast(c.error, { err: true }); }
  const k = chipKey(c.chip), title = describePick(c.chip), anchor = () => screenAnchor(p.file, p.rect);
  const at = () => chips.filter((x) => x.kind !== "sitemap" && chipKey(x) === k); // its notes and its link in the text
  const list = () => at().map((x) => ({ ref: x.ref, note: x.note, linked: !isNote(x) }));
  for (const x of at()) { x.rect = p.rect; x.view = p.view; x.key = p.key; } // where the component is now
  const none = () => { if (!at().length) inspector.drop(viewOfFile(p.file), p.key); };
  let r = await annotatePopover.open({ anchor, title, others: list(), link: !at().some((x) => !isNote(x)) });
  while (r && typeof r === "object" && r.remove != null) { // × of a note in the list: it goes, the window stays with the others (it closes with the last one)
    const x = at().find((y) => y.ref === r.remove); if (x) removeChip(x);
    if (!at().length) return;
    r = await annotatePopover.open({ anchor, title, others: list(), link: !at().some((y) => !isNote(y)) });
  }
  if (r && typeof r === "object" && r.edit != null) {
    const x = at().find((y) => y.ref === r.edit); if (!x) return;
    if (isNote(x)) return settleNote(x, await annotatePopover.open({ anchor, note: x.note, title: describeAnnotation(x) }));
    const t = await annotatePopover.open({ anchor, title: `${title}: a note instead of the link [#${x.ref}]` }); // a link becomes an annotation when a note is written
    if (t) { removeRef(x); x.note = t; Object.assign(x, x.shot ? {} : await captureScreenPart(p.file, p.rect, p.view)); renderChips(); relabelScreen(x); }
    return;
  }
  if (!r) return none(); // cancelled: nothing new
  if (chips.length >= MAX_CHIPS) { none(); return toast(`At most ${MAX_CHIPS} components and annotations per message.`); }
  if (typeof r === "object" && r.link) { // nothing written: the place is only linked in the text, as [#n] at the cursor (a string has a .link method of its own)
    const a = { ...c.chip, kind: "screen", rect: p.rect, view: p.view, key: p.key };
    if (!addChip(a)) return none();
    relabelScreen(a); return $("prompt").focus();
  }
  const pic = at().find((x) => x.shot) ?? await captureScreenPart(p.file, p.rect, p.view); // one picture of a component serves all its notes
  const a = { ...c.chip, kind: "screen", rect: p.rect, view: p.view, key: p.key, note: r, ...(pic.shot ? { shot: pic.shot, thumb: pic.thumb } : {}) };
  if (!addChip(a)) return none();
  relabelScreen(a);
}
/** The note of an annotation that is there: kept, changed, or (emptied) the annotation goes. */
function settleNote(a, note) {
  if (note === null) return;
  if (!note) return removeChip(a);
  a.note = note; renderChips();
  if (a.kind === "sitemap") planCards.repaint?.();
}
/** A click on the chip of an annotation: its place comes into view and its note opens. */
async function editAnnotation(a) {
  if (a.kind === "sitemap") {
    const anchor = await planCards.revealPage?.(a.scope, a.id);
    if (!anchor) return toast("That page is not in the map any more.");
    return settleNote(a, await annotatePopover.open({ anchor, note: a.note, title: describeAnnotation(a) }));
  }
  if (!(await showChip(a))) return;
  settleNote(a, await annotatePopover.open({ anchor: () => screenAnchor(a.file, a.rect), note: a.note, title: describeAnnotation(a) }));
}
/** The pages of a sitemap with annotations: id -> their numbers ("1,3"), for the badges on the map. */
function mapPins(scope) {
  const m = new Map();
  for (const c of chips) if (c.kind === "sitemap" && c.scope === scope) m.set(c.id, m.has(c.id) ? `${m.get(c.id)},${c.ref}` : String(c.ref));
  return m;
}
/**
 * A page (or several selected pages) of a sitemap to annotate: `pages` = [{ id, title, type, file, where }], `anchor()` = where the (last) page is.
 * Several pages get one note each, the same. The annotations of a message are of one map: the agent revises that map.
 */
async function annotatePages({ scope, pages, anchor }) {
  const other = chips.find((c) => c.kind === "sitemap" && c.scope !== scope);
  if (other) return toast(`The message already has annotations of ${other.scope === "project" ? "the sitemap of the project" : `the map of ${other.scope}`}: send them first.`, { err: true });
  // one page lists the notes it has (a click edits one, the field adds another); several pages get the same new note each
  const pageKey = pages.length === 1 ? annotationKey({ kind: "sitemap", scope, id: pages[0].id }) : null;
  const at = () => (pageKey ? chips.filter((x) => chipKey(x) === pageKey) : []); // its notes and its link in the text
  const list = () => at().map((x) => ({ ref: x.ref, note: x.note, linked: !isNote(x) }));
  // nothing written: the page(s) are only linked in the text as [#n] (not a page that is linked already)
  const linkable = () => pages.some((pg) => !chips.some((x) => !isNote(x) && chipKey(x) === annotationKey({ kind: "sitemap", scope, id: pg.id })));
  if (chips.length + pages.length > MAX_CHIPS) return toast(`At most ${MAX_CHIPS} components and annotations per message.`, { err: true });
  const title = pages.length === 1 && pages[0].id === MAP_WHOLE ? `Note on ${describeAnnotation({ kind: "sitemap", scope, id: MAP_WHOLE })}` : pages.length === 1 ? `${pages[0].title} (${pages[0].where})` : `${pages.length} pages: ${pages.map((x) => x.title).join(", ")}`;
  let r = await annotatePopover.open({ anchor, title, others: list(), link: linkable() });
  while (r && typeof r === "object" && r.remove != null) { // × of a note in the list: it goes, the window stays with the others
    const x = at().find((y) => y.ref === r.remove); if (x) removeChip(x);
    if (!at().length) return;
    await new Promise((res) => requestAnimationFrame(res)); // the map is drawn again: the anchor finds the page anew
    r = await annotatePopover.open({ anchor, title, others: list(), link: linkable() });
  }
  if (r && typeof r === "object" && r.edit != null) {
    const x = at().find((y) => y.ref === r.edit); if (!x) return;
    if (isNote(x)) return settleNote(x, await annotatePopover.open({ anchor, note: x.note, title: describeAnnotation(x) }));
    const t = await annotatePopover.open({ anchor, title: `${title}: a note instead of the link [#${x.ref}]` }); // a link becomes an annotation when a note is written
    if (t) { removeRef(x); x.note = t; renderChips(); planCards.repaint?.(); }
    return;
  }
  if (!r) return;
  if (typeof r === "object" && r.link) { // only links in the text, at the cursor (a string has a .link method of its own)
    for (const pg of pages) addChip({ kind: "sitemap", scope, ...pg }, { quiet: true });
    planCards.repaint?.(); return $("prompt").focus();
  }
  for (const pg of pages) addChip({ kind: "sitemap", scope, ...pg, note: r });
  planCards.repaint?.();
}
/** Review comments of a map from before annotations: they become annotations of this message (and leave the map). */
function adoptMapComments(scope, notes) {
  let n = 0; // each comment is an annotation of its own (a page can have several)
  for (const c of notes) if (chips.length < MAX_CHIPS && !chips.some((x) => x.kind === "sitemap" && x.scope !== scope)) { addChip({ kind: "sitemap", scope, id: c.id, title: c.id === MAP_WHOLE ? "The whole map" : c.where.split(" > ").pop(), type: c.type ?? "page", where: c.where, note: c.note }); n++; }
  if (n) toast(`${n} ${notes.some((c) => c.id === MAP_WHOLE) ? "note" : "comment"}${n === 1 ? "" : "s"} of the ${scope === "project" ? "sitemap" : `map of ${scope}`} ${n === 1 ? "is" : "are"} now ${n === 1 ? "an annotation" : "annotations"} of your next message.`);
}
/** The page was loaded again: the annotations of its components get their frames and numbers back. */
async function repinScreen(file, view) {
  const list = chips.filter((c) => c.kind !== "sitemap" && c.file === file && c.chain?.length); if (!list.length) return; // notes and links
  let changed = false;
  for (const a of list) {
    const ord = a.chain?.[0], o = typeof ord === "object" ? ord?.ordinal : ord;
    const key = await inspector.pin(view, o, a.sub, a.ref);
    if (key) a.key = key;
    if (Boolean(!key) !== Boolean(a.gone)) { a.gone = !key; changed = true; }
  }
  for (const a of list) if (a.key && !a.gone) relabelScreen(a); // a component with several notes shows all their numbers
  if (changed) renderChips();
}

// A component picked for the message is linked in the text where the cursor is, as `[#1]`, so that the text can say
// "change this one [#1] and in that one [#2] too"; the chips above the field name them (a click shows the component), the agent is told what #1, #2 are.
let chipSeq = 0;
function insertRef(p) {
  const t = $("prompt"), pre = t.value.slice(0, t.selectionStart), sep = pre && !/\s$/.test(pre) ? " " : "";
  t.setRangeText(`${sep}[#${p.ref}] `, t.selectionStart, t.selectionEnd, "end");
}
/** The frame the inspector keeps on the page around a component that was linked in the message. */
function dropMark(c) { const v = c.file && c.kind !== "sitemap" ? viewOfFile(c.file) : null; if (v && c.key) inspector.drop(v, c.key); }
/** A link [#n] that was deleted from the text takes its chip and its frame on the page with it (an annotation is not linked in the text: it stays). */
function syncChipsWithText() {
  if (!chips.length) return;
  const text = $("prompt").value, keep = chips.filter((c) => isNote(c) || new RegExp(`\\[#${c.ref}\\]`).test(text));
  if (keep.length === chips.length) return;
  const gone = chips.filter((c) => !keep.includes(c));
  chips = keep; afterRemoval(gone);
}
$("prompt").addEventListener("input", syncChipsWithText);
function removeRef(p) { const t = $("prompt"); t.value = t.value.replace(new RegExp(`\\s?\\[#${p.ref}\\]`), ""); }

// ---------- project menu: export + offline CDN cache ----------
let toastTimer;
function toast(msg, { reveal, err, action } = {}) {
  const t = $("toast"); t.className = err ? "err" : ""; t.replaceChildren(Object.assign(document.createElement("span"), { className: "toast-msg", textContent: msg })); t.hidden = false;
  for (const x of [].concat(action ?? [])) { const a = Object.assign(document.createElement("a"), { textContent: x.label }); a.onclick = x.run; t.append(a); }
  if (reveal) { const a = Object.assign(document.createElement("a"), { textContent: "Show" }); a.onclick = () => window.studio.reveal(reveal); t.append(a); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), err ? 8000 : 5000);
}
const mb = (n) => (n / 1048576).toFixed(1);
async function refreshCdn(st) {
  st ??= await window.studio.cdnStatus();
  $("offbadge").hidden = !st.offline;
}
/** Bring a frame fully into view (a hidden/clipped webview may not paint) before it is captured. */
async function showFrame(file) { canvas.focus(file); await new Promise((r) => setTimeout(r, 700)); }
window.studio.onCdnProgress((p) => toast(`Warming up the cache (${p.index + 1}/${p.total}): ${p.name}…`));
const report = (r, ok) => { if (r?.error) toast(r.error, { err: true }); else if (r?.path && !r.canceled) toast(ok(r), { reveal: r.path }); };
const notifyShare = (r) => { if (r?.error) toast(r.error, { err: true }); else if (r?.method === "eml") toast("An e-mail draft with the attachment is open in your mail client."); };

// ---------- custom screen size dialog ----------
function askSize({ w, h }) {
  return new Promise((resolve) => {
    const box = $("sizebox"), iw = $("sz-w"), ih = $("sz-h");
    iw.value = w; ih.value = h; $("sz-err").textContent = ""; box.hidden = false; iw.focus(); iw.select();
    const done = (v) => { box.hidden = true; box.onkeydown = null; box.firstElementChild.onsubmit = null; $("sz-cancel").onclick = null; resolve(v); };
    $("sz-cancel").onclick = () => done(null);
    box.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); } };
    box.firstElementChild.onsubmit = (e) => {
      e.preventDefault();
      const nw = Number(iw.value), nh = Number(ih.value), ok = (n) => Number.isInteger(n) && n >= 200 && n <= 10000;
      if (!ok(nw) || !ok(nh)) { $("sz-err").textContent = "Enter whole numbers from 200 to 10000."; return; }
      done({ w: nw, h: nh });
    };
  });
}

// ---------- confirmation dialog (in-app, replaces the native one) ----------
let confirmOpen = false;
function askConfirm({ title, detail = "", ok = "Delete", danger = true }) {
  if (confirmOpen) return Promise.resolve(false);
  confirmOpen = true;
  return new Promise((resolve) => {
    const box = $("confirm"), okBtn = $("cf-ok"), cancel = $("cf-cancel");
    $("cf-title").textContent = title; $("cf-detail").textContent = detail;
    okBtn.textContent = ok; okBtn.classList.toggle("danger", danger);
    box.hidden = false; cancel.focus(); // default action is the safe one
    const done = (v) => { box.hidden = true; confirmOpen = false; box.onclick = null; box.onkeydown = null; okBtn.onclick = cancel.onclick = null; resolve(v); };
    okBtn.onclick = () => done(true); cancel.onclick = () => done(false);
    box.onclick = (e) => { if (e.target === box) done(false); };
    box.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } };
  });
}

// ---------- present mode ----------
// One screen over the whole window, nothing else: no chat, notes, inspector or bars; only the corner button (and Esc) leaves.
let fsFile = null, fsView = null, fsWrap = null, fsFreeze = null, fsDev = "";
/** The webview always fills its wrapper; only the wrapper is sized (webviews keep a stale guest viewport when resized directly). */
function layoutFullscreen() {
  if (!fsWrap) return;
  const dev = DEVICES[fsDev];
  fsWrap.classList.toggle("dev", Boolean(dev)); $("fs").classList.toggle("dev", Boolean(dev));
  if (!dev) { fsWrap.style.cssText = ""; return; }
  const st = $("fsstage").getBoundingClientRect(), k = Math.min(1, (st.width - 40) / dev.w, (st.height - 40) / dev.h);
  Object.assign(fsWrap.style, { width: dev.w + "px", height: dev.h + "px", transform: `scale(${k})` });
}
addEventListener("resize", layoutFullscreen);
const closeFsDevMenu = () => { $("fsdevmenu").hidden = true; };
$("fsdevbtn").onclick = (e) => {
  e.stopPropagation(); const m = $("fsdevmenu");
  if (!m.hidden) return closeFsDevMenu();
  m.replaceChildren(...[["", "Full window"], ...Object.entries(DEVICES).map(([k, d]) => [k, `${d.label} ${d.w}×${d.h}`])].map(([k, label]) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: label, className: k === fsDev ? "on" : "" });
    b.onclick = () => { fsDev = k; closeFsDevMenu(); layoutFullscreen(); }; return b;
  }));
  m.hidden = false;
};
addEventListener("pointerdown", (e) => { if (!$("fsdevmenu").hidden && !$("fsctl").contains(e.target)) closeFsDevMenu(); }, true);
async function openFullscreen(file) {
  if (fsFile) closeFullscreen();
  fsDev = ""; closeFsDevMenu();
  fsFile = file; updateScreenCtx();
  fsView = document.createElement("webview");
  fsView.setAttribute("preload", webviewPreload); fsView.setAttribute("webpreferences", "backgroundThrottling=no");
  fsView.addEventListener("ipc-message", (e) => { if (e.channel === "studio-fullscreen") closeFullscreen(); else if (e.channel === "studio-escape") { if (!$("fsdevmenu").hidden) closeFsDevMenu(); else closeFullscreen(); } });
  const vw = canvas.viewOf(file);
  fsView.src = vw?.url ?? `http://127.0.0.1:${port}/${encodeURIComponent(project)}/${encodeURIComponent(file)}`;
  fsWrap = Object.assign(document.createElement("div"), { className: "fswrap" }); fsWrap.append(fsView); fsFreeze = attachFreeze(fsView, fsWrap);
  $("fsstage").replaceChildren(fsWrap); $("fs").hidden = false; layoutFullscreen();
  await window.studio.setFullScreen(true);
  fsView.addEventListener("dom-ready", () => fsView?.focus(), { once: true });
}
function closeFullscreen() {
  if (!fsFile) return;
  fsFile = null; fsView = null; fsWrap = null; $("fs").classList.remove("dev"); closeFsDevMenu(); $("fsstage").replaceChildren(); $("fs").hidden = true; updateScreenCtx();
  window.studio.setFullScreen(false);
}
function toggleFullscreen(file) { if (fsFile) closeFullscreen(); else if (file) openFullscreen(file); }
$("fsclose").onclick = closeFullscreen;
addEventListener("keydown", (e) => { if (fsFile && e.key === "Escape") { e.preventDefault(); if (!$("fsdevmenu").hidden) closeFsDevMenu(); else closeFullscreen(); } });

// ---------- @ mentions of screens ----------
const screenNames = () => canvas.files().map((f) => f.replace(/\.html$/, ""));
const trimPunct = (n) => n.replace(/[.,;:!?)\]]+$/, "");
/** Names of existing screens mentioned as @name in a text (in order, unique). */
function mentionedScreens(text) {
  const known = new Set(screenNames()), out = [];
  for (const m of text.matchAll(/(^|\s)@([^\s@]+)/g)) { const n = trimPunct(m[2]); if (known.has(n) && !out.includes(n)) out.push(n); }
  return out;
}
/** Paths of repository files mentioned as @repo/<path> (in order, unique). */
function mentionedRepoFiles(text) {
  const out = [];
  for (const m of text.matchAll(/(^|\s)@repo\/([^\s@]+)/g)) { const p = trimPunct(m[2]); if (p && !out.includes(p)) out.push(p); }
  return out;
}
/**
 * A message that asks for a component made from an existing one – an @repo/<component file> plus words like "another / new / based on /
 * extend / redesign" and "component / screen" – is the start of the "Start from an existing component" scenario. Returns { file, mode } or null.
 * After the dialog is cancelled the next send goes as a plain message (plainOnce).
 */
let plainOnce = false;
function componentIntent(text) {
  if (plainOnce || !repo || repo.error || componentBrief || planMode) return null;
  const file = mentionedRepoFiles(text).find((f) => /\.(jsx?|tsx?|mjs)$/.test(f)); if (!file) return null;
  const t = text.toLowerCase();
  if (!/(komponent|component|screen|obrazovk)/.test(t)) return null;
  const isNew = /(další|dalsi|another|nov[áaouyé]\w*|new\b|based on|podle|po vzoru|podobn|z existuj|from (the )?existing|z komponent)/.test(t);
  const isExtend = /(extend|redesign|rozšiř|rozsir|přepracuj|prepracuj|předělej|predelej|uprav)/.test(t);
  if (!isNew && !isExtend) return null;
  const name = text.replace(/@\S+/g, " ").match(/\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+)\b/)?.[1] ?? ""; // "new component CourseList …" → its name
  return { file, mode: isNew ? "new" : "extend", name };
}
/** Library components mentioned as @Uu5Elements.Button (in order, unique); the main process keeps only those that the plugin documentation knows. */
function mentionedComponents(text) {
  const out = [];
  for (const m of text.matchAll(/(^|\s)@([A-Z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)/g)) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}
function highlightMentions(text) {
  const known = new Set(screenNames());
  return esc(text).replace(/\[#(\d+)(?: ([^\]]*))?\]/g, (all, n, label) => `<span class="mention comp" title="A component marked in the message">#${n}${label ? ` ${label}` : ""}</span>`).replace(/(^|\s)@([^\s@]+)/g, (all, pre, name) => {
    if (name.startsWith("repo/")) { const base = trimPunct(name); return `${pre}<span class="mention repo" title="File of the linked repository">@${esc(base)}</span>${esc(name.slice(base.length))}`; }
    const base = trimPunct(name);
    if (!known.has(base) && /^[A-Z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(base)) return `${pre}<span class="mention lib" title="Component of a library (documentation of the uu5-development plugin)">@${esc(base)}</span>${esc(name.slice(base.length))}`;
    return known.has(base) ? `${pre}<a class="mention" data-screen="${esc(base)}.html">@${esc(base)}</a>${esc(name.slice(base.length))}` : all;
  });
}
let mentionIdx = 0;
function mentionContext() {
  const t = $("prompt"), before = t.value.slice(0, t.selectionStart), m = before.match(/(^|\s)@([^\s@]*)$/);
  return m ? { start: t.selectionStart - m[2].length - 1, query: m[2].toLowerCase() } : null;
}
let mentionSeq = 0;
/** Suggestions after "@": screens first, then (when a repository is linked) its files as @repo/<path>. */
async function updateMentions() {
  const box = $("mentions"), ctx = mentionContext(), seq = ++mentionSeq;
  const names = ctx ? screenNames().filter((n) => n.toLowerCase().includes(ctx.query)).slice(0, 6) : [];
  let files = [];
  if (ctx && repo && !repo.error) {
    const q = ctx.query.startsWith("repo/") ? ctx.query.slice(5) : ctx.query;
    if (ctx.query.startsWith("repo") || q.length >= 2) files = ((await window.studio.repoFiles(q)) ?? []).slice(0, 8).map((p) => `repo/${p}`);
    if (seq !== mentionSeq) return; // a newer keystroke is already being answered
  }
  // components of the libraries (Uu5Elements, Uu5Forms, Plus4U5Elements, …) from the documentation of the uu5-development plugin
  let libs = [];
  if (ctx && ctx.query.length >= 2 && !ctx.query.startsWith("repo")) {
    const found = await window.studio.docsSearch(ctx.query).catch(() => null);
    if (seq !== mentionSeq) return;
    libs = (found?.results ?? []).slice(0, 6);
  }
  const items = [...names, ...files, ...libs.map((c) => c.name)], libOf = new Map(libs.map((c) => [c.name, c.library]));
  if (!items.length) { box.hidden = true; return; }
  mentionIdx = Math.min(mentionIdx, items.length - 1);
  box.replaceChildren(...items.map((n, i) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: "@" + n, className: i === mentionIdx ? "on" : "", onmousedown: (e) => { e.preventDefault(); insertMention(n); } });
    b.dataset.name = n;
    if (libOf.has(n)) b.append(Object.assign(document.createElement("small"), { textContent: libOf.get(n) }));
    return b;
  }));
  box.hidden = false;
}
function insertMention(name) {
  const t = $("prompt"), ctx = mentionContext();
  if (ctx) { t.value = t.value.slice(0, ctx.start) + "@" + name + " " + t.value.slice(t.selectionStart); t.selectionStart = t.selectionEnd = ctx.start + name.length + 2; }
  else { const sep = t.value && !/\s$/.test(t.value.slice(0, t.selectionStart)) ? " " : ""; t.setRangeText(sep + "@" + name + " ", t.selectionStart, t.selectionEnd, "end"); }
  $("mentions").hidden = true; mentionIdx = 0; t.focus();
}
// a component of the catalogue let go over a screen is added to the JSX of that screen at the place the page showed. The file takes it when the
// app has code for it (jsx:insert); otherwise the toast offers to give the drop to the agent, with the documentation of the component.
const ZONE_TEXT = { before: "before", after: "after", inside: "inside" };
async function askAgentToAdd({ file, name, ordinal, zone, reason }) {
  if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
  const target = await window.studio.jsxInspect(file, [ordinal]).catch(() => null);
  const where = target?.element ? `${ZONE_TEXT[zone]} the component ${target.element.name} (in the JSX: ${target.element.snippet})` : `${ZONE_TEXT[zone]} a component`;
  const libBlock = (await window.studio.docsDescribe([name]).catch(() => null))?.text ?? "";
  const message = [`In ${file}, add the library component ${name} ${where}. It was dropped there from the catalogue, so put it exactly at that place in the JSX and give it sensible props and content (the app could not do it itself: ${reason}). Change nothing else.`, libBlock].filter(Boolean).join("\n\n");
  push({ kind: "user", text: `Add ${name} ${ZONE_TEXT[zone]} ${target?.element?.name ?? "a component"} in ${file}.` });
  setBusy(true); sentModel = $("model").value; setPlanPending(false);
  window.studio.send(message, sentModel || undefined, { plan: false, economy });
}
const catalogDrag = createCatalogDrag({
  canvas,
  onDrop: async (drop) => {
    const { file, name, ordinal, zone } = drop;
    const r = await window.studio.jsxInsert(file, ordinal, zone, undefined, name).catch((e) => ({ error: String(e?.message ?? e) }));
    if (r?.error) return toast(`${name} was not added: ${r.error}`, { err: true });
    if (r?.needsAgent) return toast(`${name} was not added: ${r.reason}.`, { err: true, action: { label: "Ask the agent", run: () => askAgentToAdd({ ...drop, reason: r.reason }) } });
    markAfterReload(file, [r.ordinal]);
    toast(`${name} added ${ZONE_TEXT[zone]} the component in ${file.replace(/\.html$/, "")}${r.addedImport ? ` (${r.addedImport} imported)` : ""}.`, { action: { label: "Undo", run: () => stepScreen(file, "undo") } });
  },
  onCancel: (overScreen) => { if (overScreen) toast("That place cannot take a component.", { err: true }); },
});
const libraryPicker = createLibraryPicker({ api: window.studio, previewUrl: (name) => `http://127.0.0.1:${port}/__preview/${encodeURIComponent(name)}.html`, onAdd: (names) => { setPanelTab("agent"); for (const n of names) insertMention(n); }, onDragStart: (name, e) => catalogDrag.start(name, e) });
// ---------- panel tabs: Agent | Components ----------
const TAB_KEY = "uu5studio.panelTab";
let panelTab = "agent";
function setPanelTab(tab, { focus = true } = {}) {
  panelTab = tab === "components" ? "components" : "agent";
  try { localStorage.setItem(TAB_KEY, panelTab); } catch { /* not remembered */ }
  $("chat").dataset.tab = panelTab;
  for (const b of document.querySelectorAll("#ptabs button")) { const on = b.dataset.tab === panelTab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); }
  $("libpane").hidden = panelTab !== "components";
  if (panelTab === "components") { libraryPicker.showInline($("libpane")); if (focus) libraryPicker.focusSearch(); }
  else { libraryPicker.leaveInline(); if (focus) $("prompt").focus(); }
}
for (const b of document.querySelectorAll("#ptabs button")) b.onclick = () => setPanelTab(b.dataset.tab);
try { setPanelTab(localStorage.getItem(TAB_KEY), { focus: false }); } catch { setPanelTab("agent", { focus: false }); }
$("libbtn").onclick = async () => {
  const names = await libraryPicker.open();
  if (!names?.length) return $("prompt").focus();
  for (const n of names) insertMention(n); // each one lands as @Name at the cursor
};
$("prompt").addEventListener("input", () => { mentionIdx = 0; updateMentions(); });
$("prompt").addEventListener("click", updateMentions);
$("prompt").addEventListener("blur", () => setTimeout(() => ($("mentions").hidden = true), 120));

// ---------- project memory: linked repository, business rules, notes of a screen ----------
let repo = null; // { path, name, branch } | { path, name, error } | null
/** Always-visible line under the chat header: the git repository the project is linked to, the branch Claude reads and Unlink. */
/** The Hand off button of the top bar: for the Solution architect, in a project with a linked repository. */
function syncHandoffBtn() { const b = $("handoffbtn"); if (!b) return; try { b.hidden = !(meta.role === "architect" && project && repo && !repo.error); } catch { b.hidden = true; /* the role is not read yet */ } }
window.addEventListener("studio:repo", (e) => { if (e.detail && !e.detail.error) showRepo(e.detail); }); // the handoff switched the working copy to its branch
function showRepo(r) {
  repo = r; syncHandoffBtn();
  const strip = $("repostrip"); strip.hidden = !r; strip.classList.toggle("err", Boolean(r?.error)); $("branchmenu").hidden = true;
  if (!r) return;
  $("rs-name").textContent = r.error ? `${r.name} (not available)` : r.name;
  const shown = r.view || r.branch; $("rs-branch").textContent = shown ? `${shown} ▾` : ""; $("rs-branch").hidden = !shown || Boolean(r.error);
  $("rs-branch").title = r.view ? `Claude reads a snapshot of branch ${r.view} (the checked-out branch is ${r.branch || "?"}). Click to change.` : "Claude reads the checked-out branch. Click to read another branch.";
  // read-only as a lock (the words do not fit the narrow chat); the words stay in the tooltip. An error keeps its short text.
  const note = $("rs-note"); note.classList.toggle("lock", !r.error);
  if (r.error) { note.textContent = "check the folder"; note.title = r.error; }
  else { note.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'; note.title = r.view ? `Snapshot of ${r.view} · read-only for Claude` : "Read-only for Claude: it reads the repository, never writes to it"; note.setAttribute("aria-label", note.title); }
  $("rs-main").title = `${r.error ? `Linked git repository is not available: ${r.error}` : "Linked git repository (Claude reads it, never writes)"}\n${r.path}${r.branch ? `\nChecked out: ${r.branch}` : ""}\nClick to open the folder`;
}
$("rs-main").onclick = async () => { const r = repo && (await window.studio.repoOpen()); if (r?.error) toast(r.error, { err: true }); }; // opens the repository folder itself in the file manager
/** Unlinking asks first: the link is project memory that Claude uses for every request. */
async function unlinkRepoFlow() {
  if (!repo) return;
  const ok = await askConfirm({ title: `Unlink the repository “${repo.name}”?`, detail: "Claude will no longer read it as context for this project. The repository and its files are not changed, and you can link it again at any time.", ok: "Unlink" });
  if (!ok) return;
  await window.studio.repoUnlink(); showRepo(null); toast("Repository unlinked.");
}
$("rs-unlink").onclick = unlinkRepoFlow;
$("rs-branch").onclick = async (e) => {
  e.stopPropagation();
  const m = $("branchmenu"); if (!m.hidden) { m.hidden = true; return; }
  const r = await window.studio.repoBranches(); if (r?.error) return toast(r.error, { err: true });
  const active = r.view || r.current;
  const item = (b) => {
    const btn = document.createElement("button"); btn.className = b.name === active ? "cur" : "";
    btn.append(Object.assign(document.createElement("span"), { textContent: b.name }), Object.assign(document.createElement("small"), { textContent: b.name === r.current ? "checked out" : b.remote ? "remote" : "" }));
    btn.onclick = () => pickBranch(b.name);
    return btn;
  };
  m.replaceChildren(...r.branches.map(item), document.createElement("hr"),
    Object.assign(document.createElement("div"), { className: "mute", textContent: "Claude reads the branch you pick as a read-only snapshot. Your checkout and the files in the repository are never changed." }));
  const br = $("rs-branch").getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(br.left, innerWidth - 308)) + "px"; m.style.top = br.bottom + 6 + "px"; m.hidden = false;
};
addEventListener("click", (e) => { if (!e.target.closest("#branchmenu")) $("branchmenu").hidden = true; });
async function pickBranch(name) {
  $("branchmenu").hidden = true; $("rs-note").textContent = "preparing…";
  const r = await window.studio.repoSetBranch(name);
  if (r?.error) { showRepo(repo); return toast(r.error, { err: true }); }
  showRepo(r); toast(r.view ? `Claude now reads branch ${r.view} of ${r.name} (read-only snapshot).` : `Claude reads the checked-out branch ${r.branch} of ${r.name}.`);
}
// ---------- project memory: business rules, notes of a screen ----------
const memory = createMemory({
  api: window.studio, toast, getScreens: () => canvas.files(),
  setCards: (file, notes) => { canvas.setScreenNotes(file, notes); if (file === fsFile) fsNote.set(notes); },
  onNotes: () => {},
});
// the notes of the screen that is open in fullscreen
const fsNote = createFsNote({
  host: $("fs"), onEdit: (id, t) => fsFile && memory.noteEdited(fsFile, id, t), onDelete: (id) => fsFile && memory.deleteNote(fsFile, id),
  onBlur: (id, t) => fsFile && memory.noteBlurred(fsFile, id, t), onAdd: () => fsFile && addNote(fsFile),
});
/** A new note on a screen: an empty card next to it (at `at` when given, e.g. where the user right-clicked) with the cursor in it. */
async function addNote(file, at) {
  const id = await memory.addNote(file);
  if (file === fsFile) fsNote.focus(id); else canvas.showNote(file, id, at);
  return id;
}
const REVEAL_LABEL = { darwin: "Show in Finder", win32: "Show in Explorer" }[window.studio.platform] ?? "Show in folder"; // what the file button does
// the business rules: a dialog from the toolbar icon; the icon shows how many rules there are
rules = createRulesPanel({
  api: window.studio, getScreens: () => canvas.files(),
  onCount: (n) => { const b = $("rulesbadge"); b.textContent = n > 99 ? "99+" : String(n); b.hidden = n === 0; $("pi-rulescount").textContent = n ? String(n) : ""; $("rulesbtn").title = n ? `Business rules of this project (${n})` : "Business rules of this project";
    // the Project button carries the number (the rules are in its menu): the agent follows them, so it should be visible that there are some
    const p = $("projrulesbadge"); p.textContent = n > 99 ? "99+" : String(n); p.hidden = n === 0;
    $("projinfo").title = n ? `The project: its description and business rules (${n} rule${n === 1 ? "" : "s"} the agent follows)` : "The project: its description and business rules"; },
});
// brand guidelines: the manual is stored, the agent distills it into DESIGN_GUIDE.md (an ordinary chat request)
const brand = createBrandDialog({
  api: window.studio, toast, onChanged: () => refreshBrandFlag(),
  askAgent: (prompt, label = "Improve the design guide from the brand manual.") => { push({ kind: "user", text: label }); setBusy(true); sentModel = $("model").value; setPlanPending(false); window.studio.send(prompt, sentModel || undefined, { plan: false, economy }); },
});
// does the project have a design guide with colours or fonts? Only then the screen menu offers the check
let brandReady = false;
async function refreshBrandFlag() {
  try { const r = project ? await window.studio.brandGet() : null; brandReady = Boolean(r?.guide && /^\s*[-*]\s+`?[\w .\/-]{1,40}?`?\s*:\s*#[0-9a-f]{3,8}\b|^\s*[-*]\s+`?font[\w-]*`?\s*:/im.test(r.guide)); } catch { brandReady = false; }
}
/** Advanced, context menu of a screen: its colours and fonts against the design guide; Fix hands the findings to Claude. */
async function checkBrand(file) {
  const r = await window.studio.brandCheck(file);
  if (r?.error) return toast(r.error, { err: true });
  if (r.empty) return toast("The project has no design guide with colours or fonts yet.", { action: { label: "Open", run: () => brand.open() } });
  const n = r.off.length, f = r.fonts.length;
  if (!n && !f) return toast(`${file} follows the design guide${r.literals.length ? ` (${r.literals.length} palette colours are written as hex instead of var(--brand-…))` : ""}.`);
  toast(`${file}: ${n ? `${n} colours` : ""}${n && f ? " and " : ""}${f ? `${f} fonts` : ""} outside the design guide.`, { err: true, action: { label: "Fix with Claude", run: () => brand.askAgentFix(r.prompt, `Make ${file} follow the design guide.`) } });
}
const openRules = (screen) => project && rules.open({ screen: typeof screen === "string" ? screen : undefined });
$("rulesbtn").onclick = openRules;
// the toolbar, in groups: the view (Canvas | Sitemap | Plans), the project (its menu: description, rules, the Advanced view; comments), Plus4U and the account
function syncViewSw() { const canvasOn = !planCards.viewKey(); document.body.classList.toggle("docview-on", !canvasOn); /* comments belong to the screens: their button shows only on the canvas */ $("canvasbtn").classList.toggle("on", canvasOn); $("canvasbtn").setAttribute("aria-pressed", String(canvasOn)); syncPlaceholder(); }
$("canvasbtn").onclick = () => { planCards.closeView(); syncViewSw(); };
syncViewSw();
{
  const menu = $("projinfomenu"), btn = $("projinfo");
  const setOpen = (on) => { menu.hidden = !on; btn.setAttribute("aria-expanded", String(on)); btn.classList.toggle("open", on); };
  /**
   * The component part of the menu: a project made from an existing component shows where it comes from (and opens that "as is" or reference
   * plan); another one offers to start from one, for the roles that work with the code (Solution architect, UI/UX designer, no role).
   */
  let origin = null;
  const paintOrigin = async () => {
    origin = await window.studio.componentOrigin?.().catch(() => null) ?? null; if (origin?.error) origin = null;
    const o = $("pi-origin"), offer = !meta.role || meta.role === "architect" || meta.role === "uiux"; // also in a project made from a component: another one can follow
    $("pi-fromcomp-t").textContent = origin ? "Another from an existing component…" : "From an existing component…";
    // Hand off for production: in the Advanced view, with a linked repository; its state from the projects list (ready / outdated / the last one)
    const hand = !isSimple() && Boolean(repo && !repo.error);
    $("pi-handoff").hidden = !hand;
    if (hand) { const p = (await window.studio.listProjects().catch(() => [])).find((x) => x.name === project); $("pi-handoffstate").textContent = p?.handoff === "outdated" ? "outdated" : p?.handoff === "ready" ? "ready" : ""; $("pi-handoffstate").className = p?.handoff ? "pi-hstate" : ""; }
    o.hidden = !origin; $("pi-fromcomp").hidden = !offer; $("pi-compsep").hidden = !origin && !offer && !hand;
    if (origin) { o.replaceChildren(document.createTextNode(origin.kind === "baseline" ? `Redesign of ${origin.name}` : `${origin.name}, based on ${origin.ref}`), Object.assign(document.createElement("small"), { textContent: origin.file.split("/").pop() })); o.title = `${origin.kind === "baseline" ? "The existing component this project changes" : "The existing component the new one follows"}: ${origin.file}. ${origin.kind === "baseline" ? "Click to see its real structure: the code's tree with what the screen adds." : "Click to see its tree read from the code."}`; }
  };
  btn.onclick = async (e) => { e.stopPropagation(); const willOpen = menu.hidden; dismissMenus(); if (willOpen) await paintOrigin(); setOpen(willOpen); };
  menu.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.classList.contains("viewtog")) return; // the Advanced view switches in place (its own handler); the menu stays open to show the new state
    setOpen(false);
    if (b.dataset.pi === "desc") openDesc(null); else if (b.dataset.pi === "rules") openRules(); else if (b.dataset.pi === "fromcomp") startFromComponent(); else if (b.dataset.pi === "handoff") window.__menuAction("repo:handoff");
    else if (b.dataset.pi === "origin" && origin) {
      // a redesign: the real structure of its screen (the code's tree with the screen's new parts); a reference: its tree read from the code (the plan)
      const files = canvas.files(), kebab = origin.name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      const screen = files.find((f) => f === `${kebab}.html`) ?? canvas.selected() ?? files[0];
      if (origin.kind === "baseline" && screen) structureDialog.open(screen);
      else { if (isSimple()) setView("advanced"); if (!planCards.openView(origin.plan)) toast(`Open the plan file plans/${origin.plan}.md.`, { err: true }); }
    }
  });
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest("#projinfow")) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { setOpen(false); e.stopPropagation(); } }, true);
}
// comments on the screens and their components: a dialog from the toolbar icon (the badge counts the open ones), "Comment on this" in the inspector
document.body.classList.toggle("comments-off", !COMMENTS); // hidden for now (features.js): no toolbar icon, frame bubble, "Comment on this", dashboard filter
const comments = createCommentsPanel({
  api: window.studio, getScreens: () => canvas.files(), getSelected: () => canvas.selected(), toast,
  onCounts: (map) => canvas.setCommentCounts(map),
  onCount: (n) => { const b = $("cmtbadge"); b.textContent = n > 99 ? "99+" : String(n); b.hidden = n === 0; $("cmtbtn").title = n ? `Comments on the screens (${n} open)` : "Comments on the screens"; },
  onShow: (file) => canvas.focus(file),
});
/** "Use this variant": asks, then the variant replaces the original and the rest is removed; on the original: the original stays and its variants are removed (all of it goes to the trash). */
/** Tells the main process whether the selected screen is a variant or has variants: the Screen menu shows "Use This Variant…" only then. */
let menuHasVariants = null;
function syncMenuScreenState() {
  const f = canvas?.selected(), files = canvas?.files() ?? [];
  const v = Boolean(f && (variantInfo(f, files) || groupVariants(files).some((g) => g.base === f)));
  if (v !== menuHasVariants) { menuHasVariants = v; window.studio.menuScreenState?.({ hasVariants: v }).catch(() => {}); }
}
async function keepVariant(file) {
  const name = (f) => f.replace(/\.html$/, ""), files = canvas.files();
  const v = variantInfo(file, files);
  const group = groupVariants(files).find((g) => g.base === file);
  if (!v && !group) return toast(`${name(file)} has no variants (variants are named like room-list-a, room-list-b next to room-list).`, { err: true });
  const ok = await askConfirm(v
    ? { title: `Use “${name(file)}” as “${name(v.base)}”?`, detail: `${v.base} is replaced by this variant (with its notes and description). The old ${v.base}${v.others.length ? ` and the other variants (${v.others.map(name).join(", ")})` : ""} are moved to the trash, so you can restore them.`, ok: "Use this variant" }
    : { title: `Keep “${name(file)}” as it is?`, detail: `The variants (${group.members.slice(1).map((m) => name(m.file)).join(", ")}) are moved to the trash, so you can restore them. ${file} stays.`, ok: "Keep original" });
  if (!ok) return;
  const r = await window.studio.variantKeep(file);
  if (r?.error) toast(r.error, { err: true }); else toast(`${name(r.kept)} is now the chosen variant${r.removed.length ? `; ${r.removed.length} other${r.removed.length === 1 ? "" : "s"} removed` : ""}.`);
}
// the flow between screens: arrows on the canvas from a screen to the screens it links to; variants of a screen as one request to the agent
flow = createFlowLayer({ world: $("world"), canvas, api: window.studio, onDraw: () => updateFlowBtn() });
vlayer = createVariantLayer({ world: $("world"), canvas, onKeep: (f) => keepVariant(f) }); vlayer.draw();
const FLOW_KEY = "uu5studio.flow";
/** The button says what is on the canvas: unavailable with fewer than two screens, pressed only while arrows are drawn. */
function updateFlowBtn() {
  const b = $("flowbtn"), few = canvas.files().length < 2, shown = flow.isOn() && flow.count() > 0;
  b.hidden = few; b.disabled = few; b.setAttribute("aria-pressed", String(!few && shown)); // a flow needs two screens: with fewer there is nothing to show, so no button
  b.title = "Show or hide the arrows between linked screens";
}
// the links of the menu are on every screen: they are drawn only for the screen in focus, never all at once
try { localStorage.removeItem("uu5studio.flownav"); } catch { /* nothing to forget */ }
// the focused screen: the selected one, or the one under the pointer; its arrows are strong, the others fade
const flowFocus = () => flow.setFocus(flowHover ?? canvas.selected());
$("world").addEventListener("pointerover", (ev) => { const f = ev.target.closest?.(".frame")?.querySelector(".fname")?.title ?? null; if (f !== flowHover) { flowHover = f; flowFocus(); } });
$("world").addEventListener("pointerleave", () => { flowHover = null; flowFocus(); });
const setFlow = (on) => { flow.setOn(on); try { localStorage.setItem(FLOW_KEY, on ? "1" : "0"); } catch { /* not remembered */ } };
$("flowbtn").onclick = () => { setFlow(!flow.isOn()); if (flow.isOn()) { flow.refresh().then(() => { if (!flow.count()) toast("No screen links to another one yet. Ask the agent to link the screens (a button that leads to another screen)."); }); } };
try { setFlow(localStorage.getItem(FLOW_KEY) !== "0"); } catch { setFlow(true); }
const variantsDialog = createVariantsDialog({
  onDone: ({ file, count, aspect, custom }) => {
    if (busy || !ready) return toast(busy ? "Wait until the agent has finished." : NO_AI, { err: true });
    push({ kind: "user", text: `Make ${count} variants of ${file.replace(/\.html$/, "")}: ${variantNames(file, count).join(", ")}.` });
    setBusy(true); sentModel = $("model").value; setPlanPending(false);
    window.studio.send(buildVariantsPrompt({ file, count, aspect, custom }), sentModel || undefined, { plan: false, economy });
  },
});
$("cmtbtn").onclick = () => COMMENTS && project && comments.open({ screen: canvas.selected() ?? undefined });
// the description of the project and of its screens (PROJECT.md): a strip above the canvas, a dialog of its own
desc = createDescPanel({
  api: window.studio, getScreens: () => canvas.files(),
  onScreens: (map) => canvas.setDescriptions(map),
  onProject: (text) => { $("pi-descstate").textContent = text ? "" : "not written yet"; $("descstrip").hidden = !text; $("descbtn").classList.toggle("on", Boolean(text)); $("ds-text").textContent = text ?? ""; $("ds-main").title = text ? `${text}\n\nClick to edit the description` : "Click to add a project description"; },
});
const openDesc = (focus) => project && desc.open({ focus });
$("ds-main").onclick = () => openDesc(null);
$("descbtn").onclick = () => openDesc(null);
window.studio.onMemoryChanged((ev) => {
  if (ev.kind === "global") return void rules.reloadGlobal();
  if (ev.project !== project) return;
  memory.changed(ev);
  if (ev.kind === "rules") rules.reload();
  if (ev.kind === "comments") comments.reload();
  if (ev.kind === "brand") { brand.refresh(); refreshBrandFlag(); }
  if (ev.kind === "project") desc.reload();
  if (ev.kind === "rules") toast(`Business rules updated${ev.added.length ? `: ${ev.added.length} added` : ""}${ev.removed.length ? `, ${ev.removed.length} removed` : ""}.`, { action: { label: "Show", run: openRules } });
});
async function linkRepoFlow() {
  const r = await window.studio.repoLink();
  if (r?.canceled) return;
  if (r?.error) return toast(r.error, { err: true });
  showRepo(r); toast(`Repository ${r.name}${r.branch ? ` (${r.branch})` : ""} linked, read-only for Claude. Mention its files with @repo/…`);
}

// ---------- right click on a screen ----------
/** With components marked in the inspector, "Mention in chat" addresses them (they become chips of the message); the screen itself stays one click further. */
const mentionItems = (name) => marked.length
  ? [[marked.length > 1 ? `Mention ${marked.length} components in chat` : "Mention component in chat", () => useMarked()], ["Mention screen in chat", () => insertMention(name)]]
  : [["Mention in chat", () => insertMention(name)]];
const v0 = (file) => variantInfo(file, canvas.files())?.base.replace(/\.html$/, "") ?? "";
function showContextMenu({ file, clientX, clientY, at }) {
  canvas.select(file);
  const m = $("ctxmenu"), name = file.replace(/\.html$/, "");
  const simple = isSimple(); // the simple view keeps what is needed to look at, edit and share a design; the rest is under Advanced
  const items = [
    [at ? "Add note here" : "Add note", () => addNote(file, at)], ...(simple ? [] : [["Add rule…", () => openRules(file)]]), ["Present", () => openFullscreen(file)], ["Fit screen", () => canvas.focus(file)], [$("inspect").classList.contains("on") ? "Exit Edit mode" : "Edit components", () => $("inspect").click()], ["Reload screen", () => canvas.reload(file)], ...(simple ? [] : mentionItems(name)),
    ["Device size…", () => canvas.openDeviceMenu(file, clientX, clientY)], ["Description…", () => openDesc(file)], ...(variantInfo(file, canvas.files()) ? [[`Use as ${v0(file)}…`, () => keepVariant(file)]] : groupVariants(canvas.files()).some((g) => g.base === file) ? [["Keep original, remove variants…", () => keepVariant(file)]] : []), ...(simple ? [] : [...(brandReady ? [["Check against brand guide", () => checkBrand(file)]] : []), ["Variants…", () => variantsDialog.open(file)], ["Show component tree", () => structureDialog.open(file)], ...(repo && !repo.error ? [["Hand off this screen…", () => openHandoffDialog({ api: window.studio, toast, screens: [file], onLinkRepo: () => linkRepoFlow(), onOpenPlan: (slug) => { if (!planCards.openView(slug)) toast(`Open the plan file plans/${slug}.md.`, { err: true }); } })]] : []), [REVEAL_LABEL, () => window.studio.revealScreen(file)]]), null, ["Copy screen", () => copyScreen(file)], ["Copy to project…", () => pickCopyTarget(file, clientX, clientY)], null, ["Delete screen…", () => deleteScreen(file), true],
  ];
  m.replaceChildren(...items.map((it) => it ? Object.assign(document.createElement("button"), { textContent: it[0], className: it[2] ? "danger" : "", onclick: () => { m.hidden = true; it[1](); } }) : document.createElement("hr")));
  m.style.left = Math.min(clientX, innerWidth - 220) + "px"; m.style.top = Math.min(clientY, innerHeight - 40 * items.length) + "px"; m.hidden = false;
}
// ---------- copy / paste of a screen, also between projects (the screen takes its pictures, notes, rules and description along) ----------
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const whatWent = (r) => [r.media ? plural(r.media, "picture") : "", r.rules ? plural(r.rules, "rule") : "", r.notes ? plural(r.notes, "note") : "", r.description ? "description" : ""].filter(Boolean);
async function copyScreen(file) {
  const r = await window.studio.copyScreen(file);
  if (r?.error) return toast(r.error, { err: true });
  const also = [r.media ? plural(r.media, "picture") : "", r.rules ? plural(r.rules, "rule") : "", r.notes ? "notes" : "", r.description ? "description" : ""].filter(Boolean);
  toast(`Screen “${file.replace(/\.html$/, "")}” copied${also.length ? ` with ${also.join(", ")}` : ""}. Paste it with ${navigator.platform.startsWith("Mac") ? "⌘V" : "Ctrl+V"} on the canvas of any project.`);
}
/** After a paste: the new frame is shown when the watcher adds it; the toast says what came along and which links lead nowhere. */
function reportPaste(r, { into } = {}) {
  const name = r.file.replace(/\.html$/, ""), also = whatWent(r);
  const parts = [`${into ? `Copied to “${into}” as` : "Pasted"} “${name}”${r.from && !into && r.from !== project ? ` from “${r.from}”` : ""}${also.length ? ` with ${also.join(", ")}` : ""}.`];
  if (r.renamedFrom) parts.push(`${r.renamedFrom.replace(/\.html$/, "")} was taken.`);
  if (r.mediaRenamed?.length) parts.push(`${plural(r.mediaRenamed.length, "picture")} renamed: a different file had the same name.`);
  if (r.missingLinks?.length) parts.push(`It links to ${r.missingLinks.map((l) => l.replace(/\.html$/, "")).join(", ")}, not in ${into ? "that" : "this"} project.`);
  toast(parts.join(" "), into ? { action: { label: "Open project", run: () => changeProject(() => window.studio.openProject(into)) } } : {});
}
async function pasteScreen({ quiet = false } = {}) {
  if (!project) return quiet || toast("Open or create a project first.", { err: true });
  const r = await window.studio.pasteScreen();
  if (r?.error) return toast(r.error, { err: true });
  if (r?.none) return quiet || toast("There is no screen on the clipboard: copy one first (⋯ › Copy screen).", { err: true });
  rules?.reload?.();
  for (let i = 0; i < 40 && !canvas.get(r.file); i++) await new Promise((ok) => setTimeout(ok, 100)); // the watcher adds the frame
  if (canvas.get(r.file)) canvas.focus(r.file);
  await new Promise((ok) => setTimeout(ok, 400)); reportPaste(r); // after the watcher's own "rules updated" toast, which would hide it
}
async function copyScreenTo(file, target) {
  const r = await window.studio.copyScreenTo(file, target);
  if (r?.error) toast(r.error, { err: true }); else reportPaste(r, { into: target });
}
/** The context menu turns into the list of the other projects. */
async function pickCopyTarget(file, clientX, clientY) {
  const others = (await window.studio.listProjects()).filter((p) => p.name !== project);
  if (!others.length) return toast("There is no other project to copy the screen to.", { err: true });
  const m = $("ctxmenu");
  m.replaceChildren(Object.assign(document.createElement("div"), { className: "ctx-head", textContent: `Copy “${file.replace(/\.html$/, "")}” to` }),
    ...others.map((p) => Object.assign(document.createElement("button"), { textContent: p.name, onclick: () => { m.hidden = true; copyScreenTo(file, p.name); } })));
  m.style.left = Math.max(8, Math.min(clientX, innerWidth - 220)) + "px"; m.style.top = Math.max(8, Math.min(clientY, innerHeight - 34 * (others.length + 1) - 12)) + "px";
  setTimeout(() => { m.hidden = false; }, 0); // the click that chose the item closes the menu first
}
// ⌘C / ⌘V outside text: the Edit menu's copy / paste fire these events on the page
const canvasClipboard = (e) => !fsFile && !confirmOpen && project && !e.target.closest?.("input,textarea,select,[contenteditable],[contenteditable=true]") && !String(getSelection()?.toString() ?? "") && !MODALS.some((id) => $(id) && !$(id).hidden); // not while a dialog is open
document.addEventListener("copy", (e) => { const f = canvas.selected(); if (f && !inspector.on && canvasClipboard(e)) { e.preventDefault(); copyScreen(f); } });
document.addEventListener("paste", (e) => { if (canvasClipboard(e)) { e.preventDefault(); pasteScreen({ quiet: true }); } });
const hideCtx = () => { $("ctxmenu").hidden = true; delete $("ctxmenu").dataset.from; $("morebtn").classList.remove("on"); };
addEventListener("click", hideCtx);
addEventListener("keydown", (e) => { if (e.key === "Escape") { hideCtx(); $("selmenu").hidden = true; updateSelbar(); } });
addEventListener("blur", hideCtx);

// ---------- actions on the selected screen (bar above the canvas) ----------
// The Share menu has two parts: first WHAT goes out (a format, the tiles), then WHAT TO DO with it (Copy, Save…, Drag).
// "Share…" opens the system share sheet on macOS (Messages, Mail, AirDrop, WhatsApp, Signal …), elsewhere an e-mail draft;
// "Drag" is the file to take with the mouse into a chat, a mail or a folder. The chosen format is remembered.
const fmtIcon = (inner) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const OUT_FORMATS = [
  { id: "png", label: "Image", hint: "The screen as a picture. Save… offers PNG, JPEG or PDF.", icon: fmtIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'), copy: "copy-png", save: "image", share: "share-png" },
  { id: "html", label: "HTML file", hint: "The source of the screen; opens in a browser.", icon: fmtIcon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'), copy: "copy-html-src", save: "copy-html", share: "share-html" },
  { id: "uu5", label: "uu5String", hint: "To paste into a document (uuBookKit, uuManagementKit).", icon: fmtIcon('<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>'), copy: "uu5string", save: "save-uu5string", share: "share-uu5" },
  { id: "zip", label: "Project ZIP", hint: "Every screen of the project, with its notes and rules.", icon: fmtIcon('<path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>'), copy: "copy-zip", save: "zip", share: "share-zip" },
];
const OUT_ACTS = [
  ["copy", "Copy", fmtIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>')],
  ["save", "Save…", fmtIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>')],
];
const OUT_KEY = "uu5studio.shareFormat";
let outFormat = (() => { try { return OUT_FORMATS.some((f) => f.id === localStorage.getItem(OUT_KEY)) ? localStorage.getItem(OUT_KEY) : "png"; } catch { return "png"; } })();
function updateSelbar() {
  const f = canvas.selected();
  $("selbar").hidden = !f; $("selmenu").hidden = true;
  for (const b of $("selbar").querySelectorAll("button.on:not([data-annotate])")) b.classList.remove("on");
  drags.clear(); // a different screen: prepare the files to drag again
}
// ----- the bar above the selected screen can be moved: by its grip or its name, the place is remembered, a double click puts it back
const SELBAR_KEY = "uu5studio.selbarPos";
let selbarPos = { x: 0, y: 0 };
try { const s = JSON.parse(localStorage.getItem(SELBAR_KEY)); if (Number.isFinite(s?.x) && Number.isFinite(s?.y)) selbarPos = { x: s.x, y: s.y }; } catch { /* nothing remembered */ }
const placeSelbar = (p) => { selbarPos = p; $("selbar").style.setProperty("--sb-x", `${p.x}px`); $("selbar").style.setProperty("--sb-y", `${p.y}px`); };
const saveSelbar = () => { try { localStorage.setItem(SELBAR_KEY, JSON.stringify(selbarPos)); } catch { /* not remembered */ } };
placeSelbar(selbarPos);
for (const id of ["selmove"]) {
  const h = $(id);
  h.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const bar = $("selbar"), cr = $("canvas").getBoundingClientRect(), br = bar.getBoundingClientRect(), start = { x: e.clientX, y: e.clientY, ...selbarPos };
    const nat = { top: br.top - selbarPos.y, mid: br.left + br.width / 2 - selbarPos.x }; // where the bar is when it has not been moved
    // a transparent layer over everything receives the movement, so that the screen (a webview) under the pointer cannot take it
    const cover = Object.assign(document.createElement("div"), { className: "sb-cover" });
    document.body.append(cover); cover.setPointerCapture?.(e.pointerId); bar.classList.add("moving");
    const move = (ev) => placeSelbar({
      x: Math.round(Math.max(cr.left + 40 - nat.mid, Math.min(cr.right - 40 - nat.mid, start.x + ev.clientX - e.clientX))), // at least a part of the bar stays in the canvas
      y: Math.round(Math.max(cr.top - nat.top, Math.min(cr.bottom - 40 - nat.top, start.y + ev.clientY - e.clientY))),
    });
    const up = () => { cover.remove(); bar.classList.remove("moving"); saveSelbar(); };
    cover.addEventListener("pointermove", move); cover.addEventListener("pointerup", up); cover.addEventListener("pointercancel", up);
  });
  h.addEventListener("dblclick", () => { placeSelbar({ x: 0, y: 0 }); saveSelbar(); });
}
async function screenAction(act, file) {
  if (act === "zip") report(await window.studio.exportZip(), (r) => `ZIP saved (${r.files} screens)`);
  else if (act === "copy-html") report(await window.studio.exportHtml(file), (r) => `Saved: ${r.path.split("/").pop()}`);
  else if (act === "image") { await showFrame(file); report(await window.studio.exportImage(file), (r) => `Image saved: ${r.path.split("/").pop()}`); }
  else if (act === "uu5string") copyUu5Screen(file);
  else if (act === "copy-png" || act === "copy-html-src" || act === "copy-zip") {
    const kind = { "copy-png": "png", "copy-html-src": "html", "copy-zip": "zip" }[act];
    if (kind === "png") await showFrame(file);
    const r = await window.studio.copyOut(kind, file);
    if (r?.error) toast(r.error, { err: true }); else if (r.pathOnly) toast("The path of the project ZIP is in the clipboard."); else toast({ png: "The image of the screen is in the clipboard.", html: "The HTML source of the screen is in the clipboard.", zip: "The project ZIP is in the clipboard: paste it into a chat, a mail or a folder." }[kind]);
  }
  else if (act === "save-uu5string") saveUu5Screen(file);
  else if (act === "fullscreen") openFullscreen(file);
  else if (act === "more") { const r = $("morebtn").getBoundingClientRect(); showContextMenu({ file, clientX: r.left, clientY: r.bottom + 6 }); }
  else if (act === "reveal") window.studio.revealScreen(file);
  else if (act === "share-uu5") { const r = await uu5File(file, (text) => window.studio.shareMail("uu5", file, text)); notifyShare(r); if (!r?.error && r.notes?.length) reportUu5Notes(r.notes); }
  else if (act.startsWith("share-")) { const kind = act.slice(6); if (kind === "png") await showFrame(file); notifyShare(await window.studio.shareMail(kind, file)); }
}
// ----- uu5String of a screen or of chosen components (see uu5StringCollect.js / uu5String.js): a snapshot of what is rendered now
/** `parts`: [{ file, ordinals }] (no ordinals = the whole screen). Returns the result of `toUu5String` or `{ error }`. */
async function uu5StringOf(parts) {
  const trees = [];
  for (const { file, ordinals = [] } of parts) {
    const view = viewOfFile(file);
    if (!view) return { error: `The screen ${file} is not shown on the canvas.` };
    const t = await Promise.race([view.executeJavaScript(collectCode(ordinals)).catch((e) => ({ error: e.message })), new Promise((r) => setTimeout(() => r({ error: "The screen did not answer." }), 5000))]);
    if (!t || t.error) return { error: t?.error ?? "The screen did not answer." };
    trees.push(t);
  }
  const r = toUu5String(mergeTrees(trees));
  return r.text ? r : { error: "Nothing to copy: the screen renders no content." };
}
/** `assets`: the files of the project the text refers to (pictures, videos); the toast offers them as a ZIP. */
function reportUu5(r, scope, assets = []) {
  if (r.error) return toast(r.error, { err: true });
  const actions = [];
  if (r.notes.length) actions.push({ label: "Details", run: () => toast(r.notes.join(" ")) });
  if (assets.length) actions.push({ label: `Files (${assets.length})…`, run: async () => report(await window.studio.assetsExport(r.name ?? "uu5string", r.text), (x) => `Files saved: ${x.path.split("/").pop()} (${x.files})`) });
  toast(summaryOf(r, { scope }) + (assets.length ? ` It refers to ${assets.length} file${assets.length > 1 ? "s" : ""} (pictures, videos) a document does not have.` : ""), actions.length ? { action: actions } : {});
}
async function copyUu5(r, scope, name) {
  if (r.error) return reportUu5(r, scope);
  const c = await window.studio.copyText(r.text).catch((e) => ({ error: e.message }));
  if (!c?.ok) return toast(c?.error ?? "Could not copy to the clipboard.", { err: true });
  const a = await window.studio.assetsList(r.text).catch(() => null);
  reportUu5({ ...r, name }, scope, a?.files ?? []);
}
/** The uu5String of a screen handed to `use(text)` (share or drag a file); the notes ride along on the result. */
async function uu5File(file, use) {
  const u = await uu5StringOf([{ file }]);
  if (u.error) return u;
  const r = await use(u.text);
  return r?.error ? r : { ...r, notes: u.notes };
}
const reportUu5Notes = (notes) => toast(`uu5String: ${notes.length} note${notes.length > 1 ? "s" : ""} on what was left out.`, { action: { label: "Details", run: () => toast(notes.join(" ")) } });
const copyUu5Screen = async (file) => copyUu5(await uu5StringOf([{ file }]), "screen", file);
async function saveUu5Screen(file) {
  const r = await uu5StringOf([{ file }]);
  if (r.error) return reportUu5(r);
  report(await window.studio.exportUu5(file.replace(/\.html$/, ".uu5string.txt"), r.text), (x) => `Saved: ${x.path.split("/").pop()}${x.files ? ` and ${x.assetsPath.split("/").pop()} (${x.files} file${x.files > 1 ? "s" : ""}: pictures, videos)` : ""}${r.notes.length ? ` (${r.notes.length} note${r.notes.length > 1 ? "s" : ""} on what was left out)` : ""}`);
}
/** The button of the Edit panel: the marked components (several, also across screens), else the shown one. */
async function copyUu5Components(p) {
  const ordOf = (m) => { const c = m.chain?.[0]; return typeof c === "number" ? c : c?.ordinal; };
  const items = marked.length > 1 ? marked.map((m) => ({ file: m.file, ordinal: ordOf(m) })) : [{ file: p.file, ordinal: p.ordinal }];
  const byFile = new Map();
  for (const it of items) if (Number.isFinite(Number(it.ordinal))) byFile.set(it.file, [...(byFile.get(it.file) ?? []), Number(it.ordinal)]);
  const n = items.length;
  copyUu5(await uu5StringOf([...byFile].map(([file, ordinals]) => ({ file, ordinals }))), n > 1 ? `${n} components` : "The component", p.file);
}
// ----- drag the selected screen as a file (into WhatsApp, Signal, Teams, Mail, a folder, ...): the ⠿ buttons of the Share menu
const drags = new Map(); // kind -> { file, path, at }
async function prepareDrag(kind) {
  const file = canvas.selected(); if (!file) return;
  const el = () => document.querySelector(`#selmenu [data-drag="${kind}"]`), have = drags.get(kind);
  if (have && have.file === file && Date.now() - have.at < 15000 && have.path) return;
  if (el()) el().dataset.state = "preparing"; drags.set(kind, { file, path: null, at: Date.now() });
  const r = kind === "uu5" ? await uu5File(file, (text) => window.studio.dragPrepare("uu5", file, text)) : await window.studio.dragPrepare(kind, file);
  if (r?.error) { if (el()) delete el().dataset.state; drags.delete(kind); return toast(r.error, { err: true }); }
  drags.set(kind, { file, path: r.path, at: Date.now() }); if (el()) el().dataset.state = "ready";
}
const LAZY_DRAG = new Set(["png", "zip"]); // rendering them is costly (the picture makes the screen flicker): prepared on hover of Drag
const DRAG_NAMES = { png: "image", html: "HTML file", uu5: "uu5String file", zip: "project ZIP" };
function dragEntry(kind) {
  const what = DRAG_NAMES[kind] ?? "file";
  const btn = Object.assign(document.createElement("button"), { className: "dragrow", draggable: true, title: `Drag the ${what} (press, hold and move) into a chat, a mail or a folder` });
  btn.innerHTML = '<span class="grip" aria-hidden="true">⠿</span><span>Drag</span>';
  btn.dataset.drag = kind;
  if (LAZY_DRAG.has(kind)) { btn.addEventListener("pointerenter", () => prepareDrag(kind)); btn.addEventListener("pointerdown", () => prepareDrag(kind)); }
  btn.onclick = (e) => { e.stopPropagation(); toast("Press, hold and drag this into a chat, a mail or a folder."); };
  btn.addEventListener("dragstart", (e) => {
    e.preventDefault();
    const d = drags.get(kind);
    if (!d?.path || d.file !== canvas.selected()) return toast("The file is still being prepared: try again in a moment.");
    window.studio.dragStart(d.path); $("selmenu").hidden = true;
  });
  return btn;
}
$("selbar").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  e.stopPropagation();
  if (b.hasAttribute("data-annotate")) return; // its own click switches the Annotate mode
  const file = canvas.selected(); if (!file) return;
  // only one menu of the bar is open at a time: the Share menu and the ⋯ menu close each other, a second click closes its own
  const ctx = $("ctxmenu"), ctxOpen = !ctx.hidden && ctx.dataset.from === "bar";
  ctx.hidden = true; delete ctx.dataset.from;
  if (b.dataset.act) {
    $("selmenu").hidden = true; updateSelbar();
    if (b.dataset.act === "edit-mode") { $("inspect").click(); return; } // the Edit mode, also on the tool rail of the canvas
    if (b.dataset.act === "more") { if (ctxOpen) return; screenAction("more", file); ctx.dataset.from = "bar"; b.classList.add("on"); return; }
    return screenAction(b.dataset.act, file);
  }
  const m = $("selmenu"), open = !m.hidden && m.dataset.for === b.dataset.menu;
  m.hidden = true; updateSelbar(); if (open) return;
  const close = () => { m.hidden = true; b.classList.remove("on"); };
  m.className = "fmt";
  const render = () => {
    const f = OUT_FORMATS.find((x) => x.id === outFormat) ?? OUT_FORMATS[0];
    const tiles = Object.assign(document.createElement("div"), { className: "fmt-tiles", role: "radiogroup", ariaLabel: "What to share" });
    tiles.append(...OUT_FORMATS.map((x) => {
      const t = Object.assign(document.createElement("button"), { className: `fmt-tile${x.id === f.id ? " on" : ""}`, role: "radio", ariaChecked: String(x.id === f.id), title: x.hint });
      t.innerHTML = `${x.icon}<span>${esc(x.label)}</span>`;
      t.onclick = (ev) => { ev.stopPropagation(); outFormat = x.id; try { localStorage.setItem(OUT_KEY, x.id); } catch { /* not remembered */ } render(); };
      return t;
    }));
    const hint = Object.assign(document.createElement("p"), { className: "fmt-hint", textContent: f.hint });
    const acts = Object.assign(document.createElement("div"), { className: "fmt-acts" });
    acts.append(...OUT_ACTS.map(([k, label, icon]) => {
      const a = Object.assign(document.createElement("button"), { className: k === "copy" ? "primary" : "", title: `${label.replace("…", "")}: ${f.label}` });
      a.innerHTML = `${icon}<span>${esc(label)}</span>`;
      a.onclick = () => { close(); screenAction(f[k], file); };
      return a;
    }), dragEntry(f.id));
    // uu5String: Publish puts the screen onto a page of a Plus4U document. Once it was published, the main part publishes again to the same
    // page in one click and the caret chooses another page or document; the line below says where it goes.
    let pubTo = null;
    if (f.id === "uu5" && p4uOn) {
      const split = Object.assign(document.createElement("div"), { className: "fmt-split" });
      const pub = Object.assign(document.createElement("button"), { title: `Publish ${file.replace(/\.html$/, "")} onto a page of a Plus4U document` });
      pub.innerHTML = `${ICONS.doc}<span>Publish…</span>`;
      pub.onclick = (ev) => { ev.stopPropagation(); close(); plus4uSync.publishScreen(file); };
      split.append(pub); acts.append(split);
      pubTo = Object.assign(document.createElement("p"), { className: "fmt-hint fmt-pubto", hidden: true });
      const shownFormat = f.id;
      plus4uSync.targetFor(file).then((t) => {
        if (!t || m.hidden || outFormat !== shownFormat || !split.isConnected) return;
        pub.querySelector("span").textContent = "Publish";
        pub.title = `Publish again to “${t.pageName || "the page"}” of “${t.documentName || "the document"}” (overwrites what was published there)`;
        pub.onclick = (ev) => { ev.stopPropagation(); close(); plus4uSync.publishScreen(file, { quick: true }); };
        const more = Object.assign(document.createElement("button"), { className: "fmt-caret", title: "Choose another page or document…", innerHTML: '<svg class="zcar" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>' });
        more.setAttribute("aria-label", "Choose another page or document");
        more.onclick = (ev) => { ev.stopPropagation(); close(); plus4uSync.publishScreen(file); };
        split.append(more);
        pubTo.textContent = `Publish → “${t.pageName || "page"}” · ${t.documentName || "document"}`; pubTo.hidden = false;
      });
    }
    m.replaceChildren(tiles, hint, document.createElement("hr"), acts, ...(pubTo ? [pubTo] : []));
    if (!LAZY_DRAG.has(f.id)) prepareDrag(f.id); // the cheap files are ready when the user takes it; a picture or a ZIP only when the pointer reaches Drag (opening the menu must not take a snapshot)
  };
  render();
  const cr = $("canvas").getBoundingClientRect(), br = b.getBoundingClientRect();
  m.style.left = br.left - cr.left + "px"; m.style.top = br.bottom - cr.top + 6 + "px"; m.dataset.for = b.dataset.menu; m.hidden = false; b.classList.add("on");
};
addEventListener("click", (e) => { if (!e.target.closest("#selbar") && !e.target.closest("#selmenu")) $("selmenu").hidden = true; });

/** Offline use (Settings > Offline use): the CDN cache lets mockups keep rendering without a network. */
const cdnActions = {
  async offline() {
    const st = await window.studio.cdnSetOffline(!(await window.studio.cdnStatus()).offline);
    refreshCdn(st); toast(st.offline ? "Offline mode on: everything loads from the cache only." : "Offline mode off.");
    canvas.all().forEach((f) => f.view.reload());
  },
  async warmup() {
    const { results, status } = await window.studio.cdnWarmup(); refreshCdn(status);
    const bad = results.filter((r) => !r.ok);
    toast(bad.length ? `Cache ready, did not load: ${bad.map((b) => b.name).join(", ")}` : `Cache ready (${status.files} files, ${mb(status.bytes)} MB).`, { err: bad.length > 0 });
  },
  async clear() { refreshCdn(await window.studio.cdnClear()); toast("CDN cache cleared."); },
};
refreshCdn();

// ---------- theme ----------
// the appearance is chosen in Settings → Appearance (no switch of its own on the dashboard)
function syncTheme() {
  const pref = window.__theme.get();
  window.studio.setTheme(pref === "auto" ? "system" : pref);
}
syncTheme();

// ---------- docked / floating chat panel ----------
const dock = createChatDock({ chat: $("chat"), header: $("chat").querySelector("header"), toggleBtn: $("chatmode"), onModeChange: (_mode, shiftX) => canvas.panBy(shiftX, 0) });
$("chatmin").onclick = () => dock.toggleCollapsed();

// ---------- app info + updates ----------
document.body.dataset.platform = window.studio.platform;
const meta = await window.studio.meta();
// Glass Effect (macOS): the toolbar and the description strip float over the canvas, so the canvas reserves their height (--glass-top)
// Glass: the toolbar, the description strip and the update notices (when they are over the canvas, in an open project) float over it, one under another
const updateGlassInset = () => {
  const b = $("bar").offsetHeight, s = $("descstrip").hidden ? 0 : $("descstrip").offsetHeight, up = $("updates"), u = up.parentElement === $("bar").parentElement ? up.offsetHeight : 0;
  document.body.style.setProperty("--glass-bar", `${b}px`); document.body.style.setProperty("--glass-updates", `${b + s}px`); document.body.style.setProperty("--glass-top", `${b + s + u}px`);
};
for (const id of ["bar", "descstrip", "updates"]) new ResizeObserver(updateGlassInset).observe($(id));
function applyGlass(on) {
  const top0 = $("canvas").getBoundingClientRect().top;
  if (on) document.body.dataset.glass = "1"; else delete document.body.dataset.glass;
  updateGlassInset();
  const d = top0 - $("canvas").getBoundingClientRect().top; if (d) canvas.panBy(0, d); // the content stays where it is on screen
}
applyGlass(Boolean(meta.glass)); window.studio.onGlass((on) => applyGlass(Boolean(on)));
// ---------- About ----------
const PLATFORM = { darwin: "macOS", win32: "Windows", linux: "Linux" };
const aboutRows = () => {
  const rt = meta.runtime ?? {}, d = meta.deps ?? {}, v = (x) => (x ? ` ${x}` : "");
  return [
    ["Application shell", `Electron${v(rt.electron)} (Chromium${v(rt.chrome)}, Node.js${v(rt.node)})`],
    ["AI backend", `Claude Code installed on this computer, driven through the Claude Agent SDK${v(d["@anthropic-ai/claude-agent-sdk"])}`],
    ["Other AI backend", "Codex (OpenAI) installed on this computer, run as `codex exec`; pick it in the model list. It reads everywhere your user can, but writes only into the project folder (sandbox)."],
    ["Mockup UI", "uu5 / uuGDS (uu5g05 libraries, loaded from the Plus4U CDN and cached locally)"],
    ["Component reference", "uu5-development and uugds Claude Code plugins (read from your local installation)"],
    ["JSX source editing", `Babel parser${v(d["@babel/parser"])}`],
    ["Export and updates", `fflate${v(d.fflate)} (ZIP), electron-updater${v(d["electron-updater"])}`],
  ];
};
const LICENSE_TEXT = "Copyright © 2026 Unicorn Vysoká škola. GNU General Public License v3 with an additional permission for the Claude Agent SDK (files LICENSE and NOTICE in the application resources).";
function openAbout() {
  $("ab-version").textContent = `Version ${meta.version} · ${PLATFORM[meta.platform] ?? meta.platform}`;
  $("ab-about").textContent = "A desktop app for designing uu5 / uuGDS user interfaces with an AI model. Describe a screen in the chat and Claude Code builds it as an interactive uu5 mockup, shown live on an infinite canvas next to your other screens. Screens are plain HTML files in a project folder; the inspector shows the uu5 components of a screen and edits their props straight in the file.";
  $("ab-tech").replaceChildren(...aboutRows().flatMap(([k, t]) => [Object.assign(document.createElement("dt"), { textContent: k }), Object.assign(document.createElement("dd"), { textContent: t })]));
  $("ab-authors").textContent = "Marek Beránek, Unicorn University";
  $("ab-license").textContent = LICENSE_TEXT;
  $("about").hidden = false; $("ab-copy").focus();
}
const closeAbout = () => { $("about").hidden = true; };
$("ab-x").onclick = closeAbout;
$("about").addEventListener("mousedown", (e) => { if (e.target === $("about")) closeAbout(); });
$("about").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeAbout(); } });
$("ab-copy").onclick = async () => {
  const text = [`uu5Mock Studio ${meta.version} (${PLATFORM[meta.platform] ?? meta.platform})`, ...aboutRows().map(([k, t]) => `${k}: ${t}`), "Authors: Marek Beránek, Unicorn University", `License: ${LICENSE_TEXT}`].join("\n");
  try { await navigator.clipboard.writeText(text); toast("Details copied."); } catch { toast("Could not copy.", { err: true }); }
};
// ----- updates of the app itself: a newer release on GitHub is offered for download (the installer opens in the browser)
let appUpdate = null;
function showAppUpdate(u) {
  appUpdate = u; $("appupdate").hidden = !u;
  if (u) { $("au-text").textContent = `Version ${u.version} available`; $("au-text").title = `uu5Mock Studio ${u.version} is available (you have ${meta.version})`; }
}
let selfInstalling = false;
const setAuBusy = (text) => { selfInstalling = Boolean(text); for (const id of ["au-download", "au-notes", "au-later"]) $(id).disabled = selfInstalling; if (text) $("au-text").textContent = text; else if (appUpdate) $("au-text").textContent = `Version ${appUpdate.version} available`; };
$("au-download").onclick = async () => {
  if (selfInstalling) return;
  if (meta.selfUpdate && appUpdate?.zip) { // the app installs the update itself and restarts
    setAuBusy("Downloading…");
    const r = await window.studio.selfInstallUpdate();
    if (r?.error) { setAuBusy(null); toast(`${r.error} You can still download the installer.`, { err: true }); const a = Object.assign(document.createElement("a"), { textContent: "Download" }); a.onclick = () => window.studio.openUpdate(appUpdate?.asset?.url ?? appUpdate?.url); $("toast").append(a); }
    return;
  }
  const r = await window.studio.openUpdate(appUpdate?.asset?.url ?? appUpdate?.url); if (r?.error) toast(r.error, { err: true });
};
$("au-notes").onclick = async () => { const r = await window.studio.openUpdate(appUpdate?.url); if (r?.error) toast(r.error, { err: true }); };
$("au-later").onclick = async () => { if (appUpdate) await window.studio.updateLater(appUpdate.version); showAppUpdate(null); };
async function checkAppUpdates() {
  toast("Checking for updates…");
  const r = await window.studio.checkUpdates();
  if (r?.status === "current") toast(`You are up to date (version ${r.version}).`);
  else if (r?.status === "available") { showAppUpdate(r); toast(`Version ${r.version} is available.`); }
  else if (r?.status === "error") toast(r.message ?? "The update check failed.", { err: true });
}
if (meta.appUpdate) showAppUpdate(meta.appUpdate);
window.studio.onUpdate((u) => {
  if (u.type === "progress") { if (selfInstalling) $("au-text").textContent = `Downloading… ${u.percent} %`; }
  else if (u.type === "installing") setAuBusy("Restarting…");
  else if (u.type === "available" && u.source === "github") showAppUpdate(u);
  else if (u.type === "available") toast(`Downloading update ${u.version}…`);
  else if (u.type === "ready") { toast(`Update ${u.version} is ready. `); const a = Object.assign(document.createElement("a"), { textContent: "Restart" }); a.onclick = () => window.studio.installUpdate(); $("toast").append(a); }
  else if (u.type === "none") toast("You are up to date.");
  else if (u.type === "error") toast(`The update failed: ${u.message}`, { err: true });
});

// ---------- projects ----------
function loadProject(info) {
  closeFullscreen();
  loading = true;
  planCards?.closeView?.(); // the plan or the map of the project before is not shown over the new one
  sitePick = null; // pages picked from a link belong to the project they were picked in
  port = info.port; webviewPreload = info.webviewPreload; project = info.project; projectList = info.projects ?? projectList;
  setBusy(false); clearChips(); resetMarked();
  chatId = info.chatId; chatList = info.chats ?? [];
  entries = info.chat ?? [];
  for (const e of entries) if (e.kind === "steps") for (const st of e.steps) if (st.status === "run") st.status = "bad";
  log.replaceChildren(); entries.forEach(paint); ctxNow = 0; updateCtxWarn();
  projectLevel = info.level ?? null; projectScope = info.scope ?? null; defaultEnv = info.environment ?? null; refreshEnvs(); updateMapBtn();
  canvas.removeAll(); planCards.clear(); planCards.load(info.layout?.plans); savedLayout = info.layout?.frames ?? {};
  syncFrames(info.screens);
  showRepo(info.repo ?? null); rules.load(Boolean(project)); desc.load(Boolean(project)); refreshBrandFlag(); if (project) { comments.reload(); setTimeout(() => flow?.refresh(), 800); } else { $("cmtbadge").hidden = true; flow?.clear(); } memory.setNotes(info.notes); memory.loadTexts();
  window.studio.plansList().then((list) => { if (!list.error && project === info.project) onPlansChanged(list); });
  window.studio.sitemapRead().then((r) => {
    if (project !== info.project) return;
    setProjectSitemap(r?.error ? null : r);
    // a project with a sitemap and no screen yet opens on the map: the empty canvas has nothing to show
    if (projectSitemap && !canvas.files().length && !planCards.viewKey()) planCards.focus("@sitemap");
  });
  if (info.layout?.camera) canvas.setCamera(info.layout.camera, false); else setTimeout(() => canvas.fitAll(false), 300);
  if (project) plus4uBar?.refresh({ remote: true }); else plus4uBar?.clear();
  $("projname").textContent = project || "No project"; $("projbtn").title = project ? `Project: ${project}` : "Open or create a project";
  updateNoProject();
  loading = false;
}
/** Start screen + disabled chat while no project is open. */
function updateNoProject() {
  const none = !project;
  if (none) document.body.dataset.noproject = "1"; else delete document.body.dataset.noproject;
  $("prompt").disabled = none; $("send").disabled = none || !ready || busy;
  syncPlaceholder();
  if (none) { closeFullscreen(); $("dash-top").after($("updates")); dashboard.show(projectList, { plan: planMode }); } else { $("descstrip").after($("updates")); dashboard.hide(); } // the update notices follow the view
  updateGlassInset();
}
/** The dashboard: a prompt makes a project for it and the chat goes on there; a card opens a project. */
/** Screens of the open project saved as a template of my own (Screen → Save as Template…, the Templates dialog). */
const saveAsTemplate = async (file) => {
  const f = file ?? canvas.selected() ?? canvas.files()[0];
  if (!project || !f) return toast("Open a project with a screen first.", { err: true });
  await openTemplateSave({ api: window.studio, files: [f], toast });
};
// the frame is written after the dialog has closed: the screens it concerns pulse until it is done
const framing = (fs, on) => { for (const f of fs) f?.el.classList.toggle("framing", on); };
document.addEventListener("uu5mock:new-frame", async () => {
  if (!project) return toast("Open a project first.", { err: true });
  const r = await openFrameDialog({ api: window.studio, toast, send: (message) => window.studio.send(message, sentModel || undefined, { plan: false, economy }) });
  if (!r?.saving) return;
  const f = canvas.get(canvas.selected() ?? canvas.files()[0]); // the frame goes onto the screen it was made from
  framing([f], true);
  const env = await r.saving.catch(() => null);
  framing([f], false);
  if (env) { await refreshEnvs(); f?.setEnv(env); }
});
document.addEventListener("uu5mock:edit-frame", async (e) => {
  const { env, label } = e.detail;
  const d = await window.studio.frameGet(env); // the stored link
  if (d?.error) return toast(d.error, { err: true });
  const r = await openFrameDialog({ api: window.studio, toast, send: (message) => window.studio.send(message, sentModel || undefined, { plan: false, economy }), edit: { env, label: d.label ?? label, url: d.url ?? "", scope: d.scope } });
  if (!r?.saving) return;
  const using = canvas.files().map((file) => canvas.get(file)).filter((f) => f?.env === env);
  framing(using, true);
  const now = await r.saving.catch(() => null); // the id of the frame afterwards (a changed visibility gives it a new one)
  framing(using, false);
  if (!now) return;
  await refreshEnvs();
  for (const f of using) { if (now !== env) f.setEnv(now); else f.reloadSoft(); }
});
document.addEventListener("uu5mock:delete-frame", async (e) => {
  const { env, label, scope } = e.detail;
  const ok = await askConfirm({ title: `Delete the frame “${label}”?`, detail: scope === "global" ? "It is available in all projects: it will be gone from all of them (screens that use it show the content only). It is moved to the trash, so you can restore it." : "Screens of this project that use it show the content only. It is moved to the trash, so you can restore it.", ok: "Delete frame" });
  if (!ok) return;
  const r = await window.studio.frameRemove(env);
  if (r?.error) return toast(r.error, { err: true });
  for (const file of canvas.files()) { const f = canvas.get(file); if (f?.env === env) f.setEnv("none"); }
  await refreshEnvs();
  toast(`Frame “${label}” deleted.`);
});
const templatesDialog = createTemplatesDialog({
  api: window.studio, toast,
  canNew: () => Boolean(project && canvas.files().length),
  onNew: () => saveAsTemplate(),
  onEdit: async (id) => { await openTemplateSave({ api: window.studio, id, toast }); templatesDialog.open(); },
  confirm: (text) => askConfirm({ title: "Delete template?", detail: text }),
});
let autoNamed = null, autoLevel = null; // a project started from the dashboard keeps its first, rough name until the first screen exists
/** The pages picked from a link on the dashboard, before the project exists: { sitemap, … } (written into the new project) or { outline, … } (goes to the agent with the first message). */
let dashPick = null;
/** The pictures attached on the dashboard (pasted, dropped, picked): they become the attachments of the first message in the new project. */
const dashImgs = { list: [], preparing: 0 };
function renderDashAttachments() {
  const box = $("dash-attachments"); box.replaceChildren();
  box.append(...imageCards(dashImgs.list, renderDashAttachments));
  if (dashImgs.preparing) box.append(Object.assign(document.createElement("div"), { className: "att busy", textContent: "…" }));
  dashDocs.renderInto(box);
  if (dashPick) box.append(sitePickCard(dashPick, () => { dashPick = null; renderDashAttachments(); }));
  box.hidden = !dashDocs.count() && !dashPick && !dashImgs.list.length && !dashImgs.preparing; $("dash-send").disabled = !$("dash-prompt").value.trim() && !dashDocs.count() && !dashImgs.list.length;
}
const dashDocs = createDocCards({ onChange: () => renderDashAttachments(), toast, structure: (card) => openSitePicker({ toast, url: card.url, onUse: (pick) => { dashPick = pick; renderDashAttachments(); }, onAgent: (pick) => { dashDocs.setPick(card.url, pick); toast(`${pick.count} page${pick.count === 1 ? "" : "s"} of “${pick.title}” go to the agent with your first message.`); } }), offerStructure: () => dashboard.scope() === "site" }); // Plus4U documents pasted on the dashboard
/**
 * The start from a component of the repository on the dashboard: only where a component can be the starting point (Application, Route,
 * Component) and for the roles that work with the code (Solution architect, UI/UX designer, or no role chosen). The architect gets it as an
 * equal way to start, with the repository last used.
 */
let dashRepo = null;
function paintDashFrom(level) {
  const role = meta.role, box = $("dash-from");
  const show = ["component", "route", "app"].includes(level) && (!role || role === "architect" || role === "uiux");
  box.hidden = !show;
  const main = show && role === "architect";
  box.classList.toggle("primary", main);
  $("dash-from-h").textContent = main ? `Start from your repository${dashRepo ? `: ${dashRepo.name}` : ""}` : "or start from a component of your repository:";
  $("dash-extend-t").textContent = main ? "Extend a component from the repository" : "Extend an existing component";
  $("dash-extend-s").textContent = main ? "read its real structure, change it, hand off the difference" : "redesign it, add to it";
  $("dash-newfrom-t").textContent = main ? "New component based on an existing one" : "New component based on one";
  $("dash-newfrom-s").textContent = main ? "its decomposition, style and conventions" : "its structure and style";
  if (main && !dashRepo) window.studio.repoRecent?.().then((r) => { if (r && !r.error) { dashRepo = r; paintDashFrom(level); } }).catch(() => {});
}
const dashboard = createDashboard({
  api: window.studio, docs: dashDocs, toast,
  onPaint: (level) => { try { paintDashFrom(level); } catch { /* the role is not read yet: the first paint after it */ } },
  images: { add: (files) => addImages(files, dashImgs), count: () => dashImgs.list.length, busy: () => dashImgs.preparing > 0 },
  onOpen: (name) => changeProject(() => window.studio.openProject(name)),
  onNew: () => newProjectFlow(),
  onNewFromDoc: () => newProjectFromDocFlow(),
  onDelete: async (name) => {
    const ok = await askConfirm({ title: `Delete the project “${name}”?`, detail: "The project folder (screens and chat history) is moved to the trash, so you can restore it.", ok: "Delete project" });
    if (ok) await changeProject(() => window.studio.deleteProject(name));
  },
  onFolder: async (op) => { const r = await window.studio.projectsFolder(op); if (r?.error) toast(r.error, { err: true }); },
  onTemplates: () => templatesDialog.open(),
  onLevel: (l) => { if (meta.role) dashboard.setPlan(planFirst(meta.role, l)); if (dashboard.scope() !== "site") dashPick = null; renderDashAttachments(); }, // the architect plans an application or a route first; the cards offer the pages of a sitemap only for a whole site
  onScope: (s) => { if (s !== "site") dashPick = null; renderDashAttachments(); },
  onStart: async ({ text, plan, model, template, templateLevel, level, scope, docs = [] }) => {
    if (!ready) return toast(NO_AI, { err: true });
    const imgs = dashImgs.list; dashImgs.list = []; renderDashAttachments(); // the pictures go with the first message of the new project
    const r = await changeProject(() => window.studio.createProject(newProjectName(projectList.map((p) => p.name))));
    if (!project || r?.error) return;
    if (template) { const a = await window.studio.templatesApply(template); if (a?.error) toast(a.error, { err: true }); else { projectLevel = a.level ?? null; defaultEnv = a.environment ?? null; } }
    const kind = await window.studio.projectSetKind({ level, scope }).catch(() => null); // what was chosen on the dashboard: decides where the sitemap is offered
    if (kind && !kind.error) { projectLevel = kind.level ?? projectLevel; projectScope = kind.scope ?? null; updateMapBtn(); }
    autoNamed = project; autoLevel = templateLevel; // once the agent has made a screen, the project is renamed after it
    if (docs.length) docCards.adopt(docs, await window.studio.docAdopt().catch(() => null)); // the documents read on the dashboard move into the new project
    const pick = dashPick; dashPick = null; // the pages picked from a link: the sitemap of the new project, or the input of its first plan
    if (pick?.sitemap) { const w = await window.studio.sitemapWrite(pick.sitemap).catch((e) => ({ error: String(e?.message ?? e) })); if (!w || w.error) toast(w?.error ?? "The sitemap could not be saved.", { err: true }); else setProjectSitemap(w); }
    else if (pick?.outline) sitePick = pick;
    if (imgs.length) { pending = imgs; renderAttachments(); }
    dashboard.reset(); setPlanMode(plan); $("model").value = model; $("prompt").value = text;
    $("form").requestSubmit();
  },
});
/**
 * Start from an existing component of a repository: extend / redesign it, or a new component modelled on it (componentStartDialog.js).
 * From the dashboard (no project) a project is made and the chosen repository linked to it first; in a project without a repository it is linked.
 */
function startFromComponent({ mode = "extend", initial, userText, onCancel } = {}) {
  const needsRepo = !project || !repo;
  openComponentStart({
    api: window.studio, toast, mode, initial, onCancel, attach: (files) => addImages(files),
    prepare: needsRepo ? async ({ repoPath }) => {
      if (!project) {
        if (!ready) return { error: NO_AI };
        const r = await changeProject(() => window.studio.createProject(newProjectName(projectList.map((p) => p.name))));
        if (!project || r?.error) return { error: r?.error ?? "The project could not be made." };
        autoNamed = project; // renamed after its first screen, as a project started from the dashboard
        await window.studio.projectSetKind({ level: "component", scope: null }).catch(() => null);
      }
      const l = await window.studio.repoLink(repoPath);
      if (l?.error) return l;
      showRepo(l); return { ok: true };
    } : null,
    onStart: (r) => {
      componentBrief = r.brief; setPlanMode(false);
      $("prompt").value = r.mode === "new" ? `Design the new component ${r.name} based on ${r.ref} (@repo/${r.files[0]}).` : `Make a screen of the existing component ${r.name} (@repo/${r.files[0]}) as it is now.${userText ? ` The user also asked: ${userText}` : ""}`;
      $("form").requestSubmit();
    },
  });
}
$("handoffbtn").onclick = () => window.__menuAction("repo:handoff");
$("dash-extend").onclick = () => startFromComponent({ mode: "extend" });
$("dash-newfrom").onclick = () => startFromComponent({ mode: "new" });
/** Write pending chat/canvas changes of the current project before the workspace is swapped. */
async function flushSaves() {
  clearTimeout(saveTimer); clearTimeout(saveLayoutTimer);
  if (!project) return;
  await Promise.all([window.studio.saveChat(project, chatId, chatSnapshot()), window.studio.saveLayout(project, { frames: canvas.layout(), camera: canvas.camera(), plans: planCards?.layout() ?? {} })]);
}
async function changeProject(action) {
  await flushSaves();
  const r = await action();
  if (r?.error) toast(r.error, { err: true }); else if (r && !r.canceled) loadProject(r);
  return r;
}
function askText({ title, value = "", ok = "OK" }) {
  return new Promise((resolve) => {
    const dlg = $("dialog"), input = $("dlg-input");
    $("dlg-title").textContent = title; $("dlg-ok").textContent = ok; $("dlg-err").textContent = ""; input.value = value;
    dlg.hidden = false; input.focus(); input.select();
    const done = (v) => { dlg.hidden = true; $("dlg-cancel").onclick = null; dlg.onkeydown = null; $("dialog").firstElementChild.onsubmit = null; resolve(v); };
    $("dlg-cancel").onclick = () => done(null);
    dlg.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); } };
    $("dialog").firstElementChild.onsubmit = (e) => { e.preventDefault(); input.value.trim() ? done(input.value.trim()) : ($("dlg-err").textContent = "Enter a name."); };
  });
}
async function renderProjectMenu() {
  projectList = await window.studio.listProjects();
  const m = $("projmenu"); m.replaceChildren();
  for (const p of projectList) {
    const b = Object.assign(document.createElement("button"), { className: p.name === project ? "cur" : "" });
    b.append(Object.assign(document.createElement("span"), { textContent: p.name }), Object.assign(document.createElement("small"), { textContent: `${p.screens} ${p.screens === 1 ? "screen" : "screens"}` }));
    b.dataset.open = p.name; m.append(b);
  }
  m.append(document.createElement("hr"));
  const items = [["new", "＋ New project…"], ...(p4uOn ? [["new-doc", "New project from a Plus4U document…"]] : [])];
  for (const [act, label] of items) {
    const b = Object.assign(document.createElement("button"), { textContent: label });
    b.dataset.act = act; m.append(b);
  }
}
/** Only one dropdown is open at a time: a button that opens one (it stops its click, so the "click outside" closers do not run) first closes every other dropdown the way a click outside would. */
function dismissMenus() { document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
// The Plus4U account (dashboard header and project toolbar): sign in, the photo of the person, sign out
const plus4uSync = createPlus4uSync({
  toast: (msg, o) => toast(msg, o), askText, askConfirm, flushSaves, reopen: () => changeProject(() => window.studio.openProject(project)),
  currentScreen: () => canvas.selected() ?? canvas.files()[0] ?? null,
  screenUu5: (file) => uu5StringOf([{ file }]),
  sitemapUu5: () => (projectSitemap?.sitemap ? sitemapUu5String(projectSitemap.sitemap) || null : null),
  onChange: () => plus4uBar?.refresh({ remote: true }),
  onBusy: (kind) => plus4uBar?.setBusy(kind),
});
// The Plus4U link in the toolbar: the document chip and Upload / Download with their dots (local changes, a newer version in Plus4U)
plus4uBar = createPlus4uBar({ root: $("p4ubar"), sync: plus4uSync, dismissMenus, toast: (msg, o) => toast(msg, o) });
let p4uTimer = null;
/** Local changes are looked at a moment after the screens change; Plus4U itself every 5 minutes while a project is open. */
const p4uLocalSoon = () => { clearTimeout(p4uTimer); p4uTimer = setTimeout(() => { if (project) plus4uBar.refresh(); }, 1500); };
setInterval(() => { if (project && !document.hidden) plus4uBar.refresh({ remote: true }); }, 5 * 60 * 1000);
if (project) plus4uBar.refresh({ remote: true }); // a project opened before the bar existed
window.studio.onPlus4uChanged?.(() => { if (project) plus4uBar.refresh({ remote: true }); }); // signed in or out: the lock and the remote dot may change
const account = createAccountButton({ buttons: [$("dash-acct"), $("acctbtn")], toast: (msg, o) => toast(msg, o), dismissMenus, onStatus: (st) => { p4uOn = Boolean(st?.signedIn); plus4uBar.setEnabled(p4uOn); dashboard.setPlus4u(p4uOn); } });
$("projbtn").onclick = async (e) => {
  e.stopPropagation(); const m = $("projmenu");
  const wasOpen = !m.hidden; dismissMenus();
  if (wasOpen) return;
  await renderProjectMenu(); m.hidden = false;
  const r = $("projbtn").getBoundingClientRect(); // open right under the button, wherever the chat panel is
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px"; m.style.top = r.bottom + 6 + "px";
};
async function newProjectFlow() { const name = await askText({ title: "New project", ok: "Create" }); if (name) await changeProject(() => window.studio.createProject(name)); }
/** A new project from an existing Plus4U document: the project uploaded to it (downloaded and linked), or an empty one linked to it. */
async function newProjectFromDocFlow() {
  const pick = await plus4uSync.pickDocumentProject();
  if (!pick) return;
  toast(pick.projectId ? "Downloading the project from Plus4U…" : "Creating the project…");
  const r = await changeProject(() => window.studio.plus4uCreateFromDocument(pick));
  if (r && !r.error) toast(pick.projectId ? `The project “${project}” was downloaded from Plus4U.` : `The project “${project}” is linked to the document.`);
}
async function renameProjectFlow() {
  if (!project) return;
  const name = await askText({ title: "Rename project", value: project, ok: "Rename" });
  if (name && name !== project) await changeProject(() => window.studio.renameProject(project, name));
}
async function deleteProjectFlow() {
  if (!project) return;
  const ok = await askConfirm({ title: `Delete the project “${project}”?`, detail: "The project folder (screens and chat history) is moved to the trash, so you can restore it.", ok: "Delete project" });
  if (ok) await changeProject(() => window.studio.deleteProject(project));
}
async function closeProjectFlow() { if (project) await changeProject(() => window.studio.closeProject()); }
$("projmenu").onclick = async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  $("projmenu").hidden = true;
  if (b.dataset.open) { if (b.dataset.open !== project) await changeProject(() => window.studio.openProject(b.dataset.open)); return; }
  const act = b.dataset.act;
  if (act === "new") await newProjectFlow();
  else if (act === "new-doc") await newProjectFromDocFlow();
  else if (act === "rename") await renameProjectFlow();
  else if (act === "delete") await deleteProjectFlow();
  else if (act === "close") await closeProjectFlow();
  else if (act === "folder") window.studio.revealProject();
  else if (act === "desc-open") openDesc(null);
  else if (act === "rules-open") openRules();
  else if (act === "repo-link") await linkRepoFlow();
  else if (act === "repo-unlink") await unlinkRepoFlow();
  else if (act?.startsWith("p4u-")) await plus4uSync.run(act);
  else if (act === "projects-open" || act === "projects-change") { const r = await window.studio.projectsFolder(act.slice(9)); if (r?.error) toast(r.error, { err: true }); }
};
addEventListener("click", (e) => { if (!e.target.closest("#projmenu")) $("projmenu").hidden = true; });
window.studio.onMenuOpened?.(() => { $("projmenu").hidden = true; }); // a menu-bar menu opened: hide the dropdown

// ---------- application menu actions (the menu itself lives in main; it only sends action ids) ----------
{
  const target = () => canvas.selected() ?? canvas.files()[0];
  const withScreen = (fn) => { const t = target(); if (t) fn(t); else toast("Select a screen first.", { err: true }); };
  const needProject = (fn) => (project ? fn() : toast("Open or create a project first.", { err: true }));
  const onMenuAction = async (action) => {
    if (action.startsWith("project:open:")) return changeProject(() => window.studio.openProject(action.slice("project:open:".length)));
    if (action.startsWith("screen:copyto:")) return withScreen((f) => copyScreenTo(f, action.slice("screen:copyto:".length)));
    if (action.startsWith("view:device:")) return canvas.setDeviceAll(action.slice("view:device:".length));
    if (action.startsWith("view:theme:")) { window.__theme.set(action.slice("view:theme:".length)); return syncTheme(); }
    switch (action) {
      case "project:new": return newProjectFlow();
      case "project:switcher": return $("projbtn").click();
      case "project:close": return closeProjectFlow();
      case "templates:open": return void templatesDialog.open();
      case "project:rename": return renameProjectFlow();
      case "project:delete": return deleteProjectFlow();
      case "chat:new": return needProject(() => $("newchat").click());
      case "chat:history": return needProject(() => $("chathist").click());
      case "screen:image": return withScreen((f) => screenAction("image", f));
      case "screen:html": return withScreen((f) => screenAction("copy-html", f));
      case "screen:uu5string": return withScreen((f) => screenAction("uu5string", f));
      case "screen:save-uu5string": return withScreen((f) => screenAction("save-uu5string", f));
      case "screen:share-html": return withScreen((f) => screenAction("share-html", f));
      case "screen:share-png": return withScreen((f) => screenAction("share-png", f));
      case "screen:share-uu5": return withScreen((f) => screenAction("share-uu5", f));
      case "docs:territory": return territoryDialog({ toast, onSaved: () => docCards.reloadWaiting() });
      case "project:rules": return needProject(openRules);
      case "brand:open": return needProject(() => brand.open());
      case "project:desc": return needProject(() => openDesc(null));
      case "project:repo-link": return needProject(() => linkRepoFlow());
      case "project:zip": return needProject(async () => report(await window.studio.exportZip(), (r) => `ZIP saved (${r.files} screens)`));
      case "project:handoff": return needProject(async () => report(await window.studio.exportHandoff("file"), () => "Specification saved"));
      case "project:handoff-copy": return needProject(async () => { const r = await window.studio.exportHandoff("text"); if (r?.error) return toast(r.error, { err: true }); await window.studio.copyText(r.text); toast("Specification copied (Markdown)."); });
      case "project:share-zip": return needProject(async () => notifyShare(await window.studio.shareMail("zip")));
      case "view:zoomin": return $("zin").click();
      case "view:zoomout": return $("zout").click();
      case "view:fit": return $("fit").click();
      case "view:arrange": return canvas.arrange();
      case "view:fullscreen": case "screen:fullscreen": return withScreen((f) => toggleFullscreen(f));
      case "screen:reload": return withScreen((f) => canvas.reload(f));
      case "screen:note": return withScreen((f) => addNote(f));
      case "screen:desc": return withScreen((f) => openDesc(f));
      case "screen:variants": return withScreen((f) => variantsDialog.open(f));
      case "screen:keepvariant": return withScreen((f) => keepVariant(f));
      case "view:flow": return needProject(() => $("flowbtn").click());
      case "screen:structure": return withScreen((f) => structureDialog.open(f));
      case "screen:template": return withScreen((f) => saveAsTemplate(f));
      case "edit:undo": case "edit:redo": return editStep(action === "edit:undo" ? "undo" : "redo");
      case "screen:rule": return withScreen((f) => openRules(f));
      case "screen:mention": return withScreen((f) => (marked.length ? useMarked() : insertMention(f.replace(/\.html$/, ""))));
      case "screen:reveal": return withScreen((f) => window.studio.revealScreen(f));
      case "screen:delete": return withScreen((f) => deleteScreen(f));
      case "screen:copy": return withScreen((f) => copyScreen(f));
      case "screen:paste": return pasteScreen();
      case "repo:branch": return needProject(() => (repo ? $("rs-branch").click() : toast("No repository is linked.", { err: true })));
      case "repo:open": return needProject(() => (repo ? $("rs-main").click() : toast("No repository is linked.", { err: true })));
      case "repo:unlink": return needProject(() => (repo ? $("rs-unlink").click() : toast("No repository is linked.", { err: true })));
      case "repo:component": return startFromComponent();
      case "repo:handoff": return needProject(() => openHandoffDialog({ api: window.studio, toast, onLinkRepo: () => linkRepoFlow(), onOpenPlan: (slug) => { if (isSimple()) setView("advanced"); if (!planCards.openView(slug)) toast(`Open the plan file plans/${slug}.md.`, { err: true }); } }));
      case "view:inspector": return needProject(() => $("inspect").click());
      case "view:chatmode": return $("chatmode").click();
      case "app:about": return openAbout();
      case "app:tour": return tour.open();
      case "app:role": return roleDialog.open(meta.role);
      case "imagegen:open": return imageGenDialog.open();
      case "settings:open": return settingsDialog.open();
      case "claude:setup": return setup.open();
      case "codex:plugins": return setup.openCodex();
      case "update:check": return checkAppUpdates();
      case "cdn:offline": return cdnActions.offline();
      case "cdn:warmup": return cdnActions.warmup();
      case "cdn:clear": return cdnActions.clear();
    }
  };
  window.studio.onMenu(onMenuAction);
  window.__menuAction = onMenuAction; // the demo recorder and the checks drive the application menu through this
}

// ---------- Claude Code setup wizard (Claude Code, sign-in, plugins; plugin updates) ----------
// ---------- welcome tour: on the first run, once the setup wizard (if it was needed) is out of the way ----------
// ---------- role (role.js): chosen before the tour on the first run, changeable in Help. It presets the starting point once; what the user sets by hand later stays ----------
const isSimple = () => document.body.classList.contains("simple");
const VIEW_KEY = "uu5studio.view"; // "simple" | "advanced": the switch next to the message field; a role presets it, the user changes it
function setView(v) {
  const simple = v === "simple";
  document.body.classList.toggle("simple", simple); try { localStorage.setItem(VIEW_KEY, simple ? "simple" : "advanced"); } catch { /* not remembered */ }
  for (const b of document.querySelectorAll(".viewtog")) { b.classList.toggle("on", !simple); b.setAttribute("aria-pressed", String(!simple)); }
  if (simple) { $("plansmenu").hidden = true; $("plansbtn").setAttribute("aria-expanded", "false"); const k = planCards.viewKey(); if (k && k !== "@sitemap") planCards.closeView(); } // Plans belong to Advanced: the switch is hidden (app.css), so an open plan would have no way back
  syncModelNow();
}
for (const b of document.querySelectorAll(".viewtog")) b.onclick = () => setView(isSimple() ? "advanced" : "simple");
try { setView(localStorage.getItem(VIEW_KEY) === "simple" ? "simple" : "advanced"); } catch { setView("advanced"); }
/** The simple view starts on a cheaper model, but only for someone who never chose one: their choice (or the default of their Claude Code) is not overridden. */
function preferModel(id) {
  let stored = null; try { stored = localStorage.getItem(MODEL_KEY); } catch { /* unknown */ }
  if (stored !== null) return;
  try { localStorage.setItem(MODEL_KEY, id); } catch { /* not remembered */ }
  pendingModel = id; // the list may not be built yet: renderModels applies it
  for (const sel of [$("model"), $("dash-model")]) if ([...sel.options].some((o) => o.value === id)) sel.value = id;
  syncModelNow();
}
/** Presets the starting point of a role: the level of templates, Plan, Eco, the first Share format, and how much of the technical side shows. */
function applyRole(role, { preset = true } = {}) {
  meta.role = isRole(role) ? role : null;
  document.body.dataset.role = meta.role ?? "";
  if (meta.role && roleOf(meta.role).hideLevels?.includes(dashboard.level?.())) dashboard.setLevel(roleOf(meta.role).level); // a saved level that this role does not offer
  $("dash-role").textContent = meta.role ? roleOf(meta.role).label : "Choose role…";
  paintDashFrom(dashboard.level?.()); syncHandoffBtn();
  if (!meta.role || !preset) return;
  const r = roleOf(role);
  setView(r.simple ? "simple" : "advanced");
  if (r.simple) preferModel("sonnet");
  dashboard.setLevel(r.level); dashboard.setPlan(r.plan);
  setPlanMode(r.plan); setEconomy(r.eco);
  outFormat = r.share; try { localStorage.setItem(OUT_KEY, r.share); } catch { /* not remembered */ }
  updateSelbar();
}
applyRole(meta.role, { preset: false });
$("dash-role").onclick = () => roleDialog.open(meta.role);
const guideDialog = createGuideDialog({ onDone: (a) => dashboard.fill(buildGuidePrompt(a), guideTemplate(a.type).template) }); // the request lands in the message field; nothing is sent
$("dash-guide").onclick = () => guideDialog.open();
const imageGenDialog = createImageGenDialog({ toast });
// Settings…: the one place for what is set up once; a row changes a value here or opens the dialog that owns the setup
const settingsDialog = createSettingsDialog({
  platform: window.studio.platform,
  getState: async () => ({
    theme: window.__theme.get(), glass: Boolean(document.body.dataset.glass), offline: Boolean((await window.studio.cdnStatus())?.offline),
    roleLabel: meta.role ? roleOf(meta.role).label : "", images: await window.studio.imageGenStatus(), agents: await window.studio.usableAgents(),
    ...(await window.studio.claudeAuth().then((a) => ({ claudeAuthInfo: a, claudeAuth: a?.usesKey ? "key" : "account" })).catch(() => ({}))),
  }),
  run: (action) => (action === "folder:projects-change" ? window.studio.projectsFolder("change").then((r) => { if (r?.error) toast(r.error, { err: true }); }) : window.__menuAction(action)),
  setValue: async (key, value) => {
    if (key === "theme") { window.__theme.set(value); syncTheme(); }
    else if (key === "glass") { if (Boolean(document.body.dataset.glass) !== value) await window.studio.toggleGlass(); }
    else if (key === "offline") { const on = Boolean((await window.studio.cdnStatus())?.offline); if (on !== value) await cdnActions.offline(); }
    else if (key === "claudeAuth") { const r = await window.studio.claudeAuth(value); if (r?.error) toast(r.error, { err: true }); else { toast(value === "key" ? "Claude Code now uses the API key: every request is paid per token." : "Claude Code now uses your Claude account and its plan."); checkClaude(true); refreshLimits(true); } }
  },
});
const roleDialog = createRoleDialog({
  onChoose: async (role) => { const r = await window.studio.setRole(role); if (r?.error) return toast(r.error, { err: true }); meta.roleAsked = true; $("rolehint")?.remove(); applyRole(role); toast(`Set up for: ${roleOf(role).label}. Settings → Your role changes it.`); maybeTour(); },
  onSkip: async () => { await window.studio.setRole("other"); meta.roleAsked = true; $("rolehint")?.remove(); applyRole("other"); maybeTour(); }, // Skip = the simplest view
});
/** An existing user is asked once, without a dialog over the work: a strip on the dashboard. */
function maybeRoleHint() {
  if (meta.roleAsked || $("rolehint")) return;
  const strip = Object.assign(document.createElement("div"), { id: "rolehint", innerHTML: '<span>New: set your role and the app starts closer to what you do.</span><button type="button" class="rh-set">Choose role…</button><button type="button" class="rh-x" aria-label="Not now" title="Not now">✕</button>' });
  const done = () => { strip.remove(); meta.roleAsked = true; window.studio.skipRole(); };
  strip.querySelector(".rh-set").onclick = () => { done(); roleDialog.open(meta.role); };
  strip.querySelector(".rh-x").onclick = done;
  $("dash-top").after(strip);
}
const tour = createTour({ isSimple, onClose: () => { meta.tourSeen = true; window.studio.tourDone(); } });
function maybeTour() {
  if (tour.isOpen() || roleDialog.isOpen()) return;
  if (!meta.roleAsked) { // a new user chooses the role first (the tour follows); an existing one gets a quiet strip
    if (meta.tourSeen) { maybeRoleHint(); return; }
    setTimeout(() => { if (!meta.roleAsked && !roleDialog.isOpen() && !tour.isOpen() && $("setup").hidden) roleDialog.open(); }, 700);
    return;
  }
  if (meta.tourSeen) return;
  setTimeout(() => { if (!meta.tourSeen && !tour.isOpen() && $("setup").hidden) tour.open(); }, 700);
}
setup = createSetup({
  api: window.studio, toast, isBusy: () => busy,
  onStatus: (st) => {
    claudeReady = st.state === "ready";
    maybeTour();
    updateChatReady();
    if (claudeReady) $("model").title = `Claude Code ${st.version} · ${st.email ?? ""}`;
  },
});
const checkClaude = (refresh) => setup.check(refresh).then((st) => { refreshAgents(refresh); return st; }); // the usable providers and their models follow the setup
// ---------- attached screenshots ----------
const MAX_IMAGES = 8, MAX_SIDE = 2000, THUMB_SIDE = 320;
let pending = []; // [{id,name,mime,data(base64),thumb}]
let componentBrief = null; // the task for the agent after Start from an Existing Component, sent with the next message
let preparing = 0;
const docCards = createDocCards({ onChange: () => renderAttachments(), toast, structure: (card) => pickFromLink(card.url, true, card.tree), offerStructure: () => mapOffered(), onUse: (use) => { if (use === "sitemap") setPlanMode(true); } }); // a sitemap is proposed in Plan mode // Plus4U documents pasted as links, with a picture of how they look
const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
/** Normalizes any image to a PNG (or JPEG when huge) of at most 2000 px plus a small thumbnail. */
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(bmp.width * k)), height: Math.max(1, Math.round(bmp.height * k)) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await toBlob(c, "image/png"), mime = "image/png";
  if (blob.size > 4 * 1024 * 1024) { blob = await toBlob(c, "image/jpeg", 0.9); mime = "image/jpeg"; }
  const tk = Math.min(1, THUMB_SIDE / Math.max(c.width, c.height));
  const t = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(c.width * tk)), height: Math.max(1, Math.round(c.height * tk)) });
  t.getContext("2d").drawImage(c, 0, 0, t.width, t.height);
  return { id: crypto.randomUUID(), name: file.name || "screenshot.png", mime, data: await blobToBase64(blob), thumb: t.toDataURL("image/jpeg", 0.75) };
}
/** The cards of attached pictures (in the chat or on the dashboard): each a Reference / In design switch and ✕. */
function imageCards(list, rerender) {
  return list.map((im) => {
    const d = Object.assign(document.createElement("div"), { className: `att${im.asset ? " asset" : ""}`, title: im.name });
    d.append(Object.assign(document.createElement("img"), { src: im.thumb, alt: im.name }));
    // two modes: a reference (the agent only looks at it) or a picture that goes into the design itself (logo...)
    const isSvg = im.mime === "image/svg+xml", seg = Object.assign(document.createElement("div"), { className: "att-mode" });
    for (const [asset, label, tip] of [[false, "Reference", "The agent only looks at this picture."], [true, "In design", "This picture is placed into the design as it is (saved in the project’s assets folder): a logo, a specific image."]]) {
      seg.append(Object.assign(document.createElement("button"), { type: "button", textContent: label, className: !!im.asset === asset ? "on" : "", disabled: isSvg && !asset, title: isSvg && !asset ? "An SVG can only be used in the design." : tip, onclick: () => { im.asset = asset; rerender(); } }));
    }
    d.append(seg);
    d.append(Object.assign(document.createElement("button"), { type: "button", textContent: "✕", title: "Remove attachment", onclick: () => { const i = list.indexOf(im); if (i >= 0) list.splice(i, 1); rerender(); } }));
    return d;
  });
}
function renderAttachments() {
  const box = $("attachments"); box.replaceChildren();
  box.append(...imageCards(pending, renderAttachments));
  if (preparing) box.append(Object.assign(document.createElement("div"), { className: "att busy", textContent: "…" }));
  docCards.renderInto(box);
  if (sitePick) box.append(sitePickCard(sitePick, () => { sitePick = null; renderAttachments(); }));
  box.hidden = !pending.length && !preparing && !docCards.count() && !sitePick;
}
/** An SVG is not rasterised: it goes as it is (only as a picture for the design) and the thumbnail is the drawing itself. */
async function prepareSvg(file) {
  const buf = await file.arrayBuffer();
  const data = await blobToBase64(new Blob([buf]));
  return { id: crypto.randomUUID(), name: file.name || "image.svg", mime: "image/svg+xml", data, thumb: `data:image/svg+xml;base64,${data}`, asset: true };
}
async function addImages(files, dash = null) {
  const manuals = [...files].filter(isBrandFile);
  if (manuals.length && dash) { toast("A brand manual (PDF, HTML, Markdown) can be added once the project is open. Here you can attach pictures.", { err: true }); files = [...files].filter((f) => !isBrandFile(f)); }
  else if (manuals.length) { // a PDF / HTML / Markdown file is a brand manual, not a picture
    if (!project) toast("Open a project first.", { err: true });
    else if (await askConfirm({ title: "Use as brand manual?", danger: false, detail: `“${manuals.map((f) => f.name).join("”, “")}” will be stored in the project and read for colours, fonts and logo sizes, which go into the design guide every screen follows.`, ok: "Use as manual" })) await brand.importFiles(manuals);
    files = [...files].filter((f) => !isBrandFile(f));
  }
  const imgs = [...files].filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) return;
  // the chat keeps its pictures in `pending`, the dashboard in `dash` ({ list, preparing })
  const list = dash ? dash.list : pending, busyNow = () => (dash ? dash.preparing : preparing), addBusy = (k) => { if (dash) dash.preparing += k; else preparing += k; }, rerender = dash ? renderDashAttachments : renderAttachments;
  if (list.length + busyNow() + imgs.length > MAX_IMAGES) { toast(`You can attach at most ${MAX_IMAGES} images at a time.`, { err: true }); imgs.splice(Math.max(0, MAX_IMAGES - list.length - busyNow())); }
  addBusy(imgs.length); rerender();
  for (const f of imgs) {
    try { list.push(f.type === "image/svg+xml" ? await prepareSvg(f) : await prepareImage(f)); } catch { toast(`The image “${f.name || "from the clipboard"}” could not be loaded.`, { err: true }); }
    addBusy(-1); rerender();
  }
  $(dash ? "dash-prompt" : "prompt").focus();
}
$("prompt").addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); addImages(files); return; }
  docCards.scan(e.clipboardData?.getData("text") ?? ""); // a link to a uuBookKit / uuManagementKit document stays in the text and gets a card
});
$("prompt").addEventListener("input", () => docCards.sync($("prompt").value)); // a link deleted from the text takes its card away
$("attach").onclick = () => $("attachfile").click();
$("attachfile").onchange = (e) => { addImages(e.target.files); e.target.value = ""; };
{
  const chat = $("chat"), hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  let depth = 0;
  chat.addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; $("drophint").hidden = false; } });
  chat.addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; $("drophint").hidden = true; } });
  chat.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  chat.addEventListener("drop", (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; $("drophint").hidden = true; addImages(e.dataTransfer.files); });
}

// ---------- input ----------
$("form").onsubmit = async (e) => {
  e.preventDefault();
  if (busy || !ready) return;
  if ($("send").dataset.build === "1") { const p = proposedPlan(); if (p) { setPlanMode(false); buildPlan(p); } return; }
  if (preparing) return toast("The images are still loading, one moment.");
  const imgs = pending.slice();
  let prompt = $("prompt").value.trim();
  if (docCards.scan(prompt) || docCards.busy()) return toast("The documents are still loading, one moment.");
  if (docCards.blocked().length) return toast("A document could not be read yet: sign in, or remove its card.", { err: true });
  const notes = chips.filter(isNote);
  if (!prompt && !imgs.length && !docCards.count() && !notes.length) return;
  if (!prompt && notes.length) prompt = "Apply the annotations.";
  if (!prompt) prompt = docCards.count() ? "Use the attached document." : imgs.some((i) => i.asset) ? "Use the attached picture in the design." : "Attaching a screenshot, see the attachment.";
  const comp = componentIntent(prompt);
  if (comp) { // "another one from @repo/…": the same scenario as Start from an existing component, the dialog filled in from the message
    startFromComponent({ mode: comp.mode, initial: { file: comp.file, name: comp.name, description: prompt }, userText: prompt, onCancel: () => { plainOnce = true; } });
    return;
  }
  plainOnce = false;
  const docs = docCards.take(), pages = sitePick;
  // attached screenshots become files in the project (hidden folder) that the agent opens with Read
  let paths = [], assetPaths = [];
  const refs0 = imgs.filter((i) => !i.asset), assets0 = imgs.filter((i) => i.asset);
  if (refs0.length) {
    const r = await window.studio.saveAttachments(refs0.map(({ mime, data }) => ({ mime, data })));
    if (!Array.isArray(r)) return toast(r?.error ?? "The attachments could not be saved.", { err: true });
    paths = r;
  }
  if (assets0.length) { // pictures for the design itself become served files in the project (assets/)
    const r = await window.studio.saveAssets(assets0.map(({ mime, data, name }) => ({ mime, data, name })));
    if (!Array.isArray(r)) return toast(r?.error ?? "The pictures could not be saved.", { err: true });
    assetPaths = r;
  }
  // the pictures of the annotated components become files like the attached screenshots
  const shots = chips.filter((c) => c.shot);
  if (shots.length) {
    const r = await window.studio.saveAttachments(shots.map((c) => c.shot));
    if (Array.isArray(r)) shots.forEach((c, i) => { c.shotPath = r[i]; }); // without them the notes still go
  }
  const all = chips.slice(), ctx = all.filter((c) => c.kind !== "sitemap"), mapNotes = all.filter((c) => c.kind === "sitemap");
  const shown = pages ? `${prompt}\n🗺 Pages picked from “${pages.title}” (${pages.count})` : prompt;
  push({ kind: "user", text: shown, ...(all.length ? { annotations: historyOf(all) } : {}), ...(imgs.length ? { images: imgs.map(({ thumb, name, asset }) => ({ thumb, name, asset })) } : {}), ...(docs.length ? { docs: docs.map(({ title, url, kind, thumb }) => ({ title, url, kind, thumb })) } : {}) });
  $("prompt").value = ""; pending = []; sitePick = null; renderAttachments(); setPlanPending(planMode); setBusy(true); // Plan mode: the empty canvas says a plan is coming, not a screen
  const refs = mentionedScreens(prompt), repoRefs = mentionedRepoFiles(prompt), libNames = mentionedComponents(prompt);
  const libBlock = libNames.length ? (await window.studio.docsDescribe(libNames).catch(() => null))?.text ?? "" : "";
  const noteBlock = await memory.notesFor([...refs.map((n) => `${n}.html`), ...(fsFile ? [fsFile] : []), ...(ctx ?? []).map((c) => c.file)]);
  if (fsFile) setWorkFile(fsFile); // the target is known up front when a screen is open in fullscreen
  const extra = [
    refs.length && `Referenced screens (files in the project's working folder): ${refs.map((n) => n + ".html").join(", ")}. Read their current content first, change only what the user asks for and leave the rest unchanged.`,
    repoRefs.length && repo && `Referenced files of the linked git repository (read-only, ${repo.readDir ?? repo.path}): ${repoRefs.map((p) => `${repo.readDir ?? repo.path}/${p}`).join(", ")}. Read them first and stay consistent with their names, props and structure.`,
    libBlock,
    noteBlock,
    docsContext(docs.filter((d) => !d.pick)),
    ...docs.filter((d) => d.pick).map((d) => structureContext({ ...d.pick, file: d.file, shot: d.shot, existing: Boolean(projectSitemap) })), // a link marked "Sitemap" on its card: the structure behind it, not a page to redesign
    pages && structureContext({ ...pages, existing: Boolean(projectSitemap) }), // with a sitemap in the project the pages extend it, they never replace it
    paths.length && `Attached images (screenshots from the user, as files): ${paths.join(", ")}. Open them with the Read tool first and base your work on what they show.`,
    assetPaths.length && `Pictures to USE IN THE DESIGN (not just references; e.g. a logo): ${assetPaths.join(", ")}. They are already files in the project, so do not copy or re-create them: place each into the screen with exactly that relative path (src="${assetPaths[0]}"), at its natural proportions. Open one with the Read tool only to see what it shows.`,
    fsFile && `Context: the user is viewing the screen ${fsFile} in fullscreen preview right now. Unless they name another screen, their request is about ${fsFile}: change that file.`,
    annotationsContext(ctx),
    mapNotes.length && mapRevision(mapNotes),
    componentBrief, // Start from an existing component: the task of building its screen (once)
  ].filter(Boolean);
  componentBrief = null;
  // annotations of the map of a plan are answered with a revised plan; those of the map of the project in Agent mode change it at once (the previous map is kept, the user can take it back)
  const plan = planMode || (mapNotes.length > 0 && !mapDirect(mapNotes));
  if (window.__plan?.dryRun) { window.__plan.lastSend = { message: extra.length ? `${prompt}\n\n${extra.join("\n")}` : prompt, plan }; setBusy(false); clearChips(); if (chatPick) setInspect(false); return; } // the automated checks read the message instead of starting the agent
  sentModel = $("model").value;
  setPlanPending(plan);
  window.studio.send(extra.length ? `${prompt}\n\n${extra.join("\n")}` : prompt, sentModel || undefined, { plan, economy });
  clearChips(); if (chatPick) setInspect(false);
};
/** The request to revise the sitemap the annotations are on: their notes, the rules of the map and the map (or the plan) as it is now. */
/** Annotations of the map of the project in Agent mode are applied at once (sitemap_edit, the previous map is kept); the map of a plan, or Plan mode, is revised as a plan. */
const mapDirect = (list) => !planMode && list.length > 0 && list[0].scope === "project";
function mapRevision(list) {
  const scope = list[0].scope, m = planCards.mapOf?.(scope); if (!m?.sitemap) return null;
  return reviseMessage({ slug: scope === "project" ? null : scope, sm: m.sitemap, body: m.body ?? "", notes: list.map((a) => ({ where: `#${a.ref} ${a.where}`, note: a.note })), direct: mapDirect(list) });
}
$("prompt").onkeydown = (e) => {
  const box = $("mentions");
  if (!box.hidden) {
    const n = box.children.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); mentionIdx = (mentionIdx + (e.key === "ArrowDown" ? 1 : n - 1)) % n; updateMentions(); return; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(box.children[mentionIdx].dataset.name); return; }
    if (e.key === "Escape") { e.preventDefault(); box.hidden = true; return; }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("form").requestSubmit(); }
};
$("stop").onclick = () => window.studio.stop();
/** Show another conversation of the open project (main has already switched the Claude session). */
function showChat(v) {
  chatId = v.chatId; chatList = v.chats ?? chatList;
  entries = v.entries ?? [];
  for (const e of entries) if (e.kind === "steps") for (const st of e.steps) if (st.status === "run") st.status = "bad";
  loading = true; log.replaceChildren(); entries.forEach(paint); loading = false;
  setBusy(false); clearChips(); ctxNow = 0; updateCtxWarn();
}
const fmtWhen = (ts) => {
  const d = new Date(ts), t = d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(new Date()) - day(d)) / 864e5);
  return diff === 0 ? `today ${t}` : diff === 1 ? `yesterday ${t}` : `${d.toLocaleDateString("en", { day: "numeric", month: "short" })} ${t}`;
};
const chatCount = (n) => `${n} ${n === 1 ? "message" : "messages"}`;
async function switchToChat(id) {
  if (id === chatId) return;
  if (busy && !(await askConfirm({ title: "Switch conversation?", detail: "The agent is working right now. Switching stops the running task.", ok: "Switch", danger: false }))) return;
  await flushSaves(); showChat(await window.studio.switchChat(id));
}
async function renderHistMenu() {
  chatList = await window.studio.listChats();
  const m = $("histmenu"); m.replaceChildren(Object.assign(document.createElement("h4"), { textContent: `Chat history · ${project}` }));
  for (const c of chatList) {
    const row = document.createElement("div"); row.className = "row" + (c.id === chatId ? " cur" : "");
    const open = document.createElement("button"); open.className = "open"; open.type = "button";
    open.append(Object.assign(document.createElement("b"), { textContent: c.title }), Object.assign(document.createElement("small"), { textContent: `${fmtWhen(c.updatedAt)} · ${chatCount(c.messages)}` }));
    open.onclick = () => { m.hidden = true; switchToChat(c.id); };
    const del = Object.assign(document.createElement("button"), { className: "del", type: "button", title: "Delete conversation", innerHTML: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' });
    del.setAttribute("aria-label", "Delete conversation");
    del.onclick = async (e) => {
      e.stopPropagation(); m.hidden = true;
      if (!(await askConfirm({ title: `Delete the conversation “${c.title}”?`, detail: "This conversation will be removed. The screens on the canvas stay unchanged.", ok: "Delete conversation" }))) return;
      await flushSaves(); showChat(await window.studio.deleteChat(c.id));
    };
    row.append(open, del); m.append(row);
  }
}
$("chathist").onclick = async (e) => {
  e.stopPropagation(); const m = $("histmenu");
  const wasOpen = !m.hidden; dismissMenus();
  if (wasOpen) return;
  await renderHistMenu(); m.hidden = false;
  const r = $("chathist").getBoundingClientRect(); // right under the button, wherever the chat panel is
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + "px"; m.style.top = r.bottom + 6 + "px";
};
addEventListener("click", (e) => { if (!e.target.closest("#histmenu")) $("histmenu").hidden = true; });
$("newchat").onclick = async () => {
  await flushSaves();
  const v = await window.studio.newChat(); showChat(v);
  toast(v.created ? "New chat. You will find the previous one in the history." : "This chat is empty, you can start typing right away.");
  $("prompt").focus();
};


// ---------- boot ----------
const info = await window.studio.info();
loadProject(info);
checkClaude(false).then((st) => { if (st?.state === "ready") setup.checkUpdates(false); }); // a quiet look for plugin updates once Claude is ready
