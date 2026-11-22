/**
 * The handoff package: what a solution architect hands over for the real components to be built in the linked repository.
 * `.uu5mock/handoff/<slug>/` holds HANDOFF.md (people and agents), handoff.json (the same, structured, with a hash of every mockup),
 * BUILD.md (the task for the agent), the mockups with their pictures, pictures of the screens and the project memory;
 * PROMPT.md the task in plain words for the agent; `.claude/commands/build-handoff.md` lets Claude Code start it. `packageFiles` is pure; `gatherPackage` reads the project.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { strToU8 } from "fflate";
import { buildHandoff, gatherHandoff } from "./handoff.mjs";
import { mockupEntries, docEntries, SERVE } from "./exporter.mjs";
import { readPlan } from "./plans.mjs";
import { extractPlan, outlineText, isMockOnly, looksMockOnly, normalizeTree, componentView } from "../renderer/planTree.js";
import { structureOf } from "./jsxSource.mjs";
import { slugify } from "../renderer/planDoc.js";
import { HANDOFF_ROOT, COMMAND_FILE, buildInstructions, slashCommand, handoffPrompt } from "./handoffCommand.mjs";
import { mockupComponents, repoComponentProps, propsDiff } from "./componentProps.mjs";
import { readLinks } from "./handoffLinks.mjs";
import { isSecretPath } from "./repo.mjs";
import { LIB_EQUIV, libraryDeviations, deviationLines, readBaselines, readReferences } from "./componentTree.mjs";
import { screenBaselines } from "./componentUpdate.mjs";

export const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

/**
 * The components to build: the nodes of kind "new" of the plan's tree, with the chain of their parents (where they are used).
 * [{ name, note?, props, target?, accept, relation?, render?, data?, under: [names of the parents] }]
 */
export function componentsToBuild(tree) {
  const out = [], seen = new Map();
  const walk = (n, chain) => {
    // what the plan changes: new components, and existing ones (of a baseline) that are modified, added back or removed; "keep" is context only
    const changes = n.kind === "existing" && ["modify", "remove", "add"].includes(n.change);
    if ((n.kind === "new" || changes) && /^[A-Za-z_$]/.test(n.name)) {
      const old = seen.get(n.name);
      if (old) { if (chain.length) old.used.push(chain.join(" › ")); } // the same component in several places: one entry, every place
      else {
        // mockOnly: a helper of the mockup that is not built (chosen, or guessed when `guessed`)
        const c = { name: n.name, props: n.props ?? [], accept: n.accept ?? [], used: chain.length ? [chain.join(" › ")] : [], mockOnly: changes ? false : isMockOnly(n), guessed: !changes && typeof n.mockOnly !== "boolean" && looksMockOnly(n), ...(n.change === "remove" ? { remove: true } : {}) };
        for (const k of ["note", "target", "source", "role", "relation", "render", "disabled", "data", "label", "change"]) if (n[k]) c[k] = n[k];
        seen.set(n.name, c); out.push(c);
      }
    }
    for (const ch of n.children ?? []) walk(ch, [...chain, n.name]);
  };
  if (tree) walk(tree, []);
  return out;
}

/**
 * The components designed in the mockups (no plan): every component a screen defines itself, merged by name over the screens, with the
 * props it gets there, and what `links` (.studio/links.json) says about it (Build or mockup only, the existing file it changes, where a new one goes, props, criteria).
 */
export function screenComponents(screens, links = {}) {
  const out = new Map();
  for (const { file, html } of screens) {
    for (const m of mockupComponents(html, file.replace(/\.html$/, ""))) {
      const c = out.get(m.name);
      if (c) { c.used.push(...m.used); for (const p of m.props) if (!c.inferred.some((q) => q.name === p.name)) c.inferred.push(p); }
      else out.set(m.name, { name: m.name, used: [...m.used], inferred: m.props, screens: [] });
      out.get(m.name).screens.push(file);
    }
  }
  return [...out.values()].map((c) => {
    const l = links[c.name] ?? {}, guess = looksMockOnly(c);
    return {
      name: c.name, used: c.used, screens: [...new Set(c.screens)], inferred: c.inferred,
      props: Array.isArray(l.props) ? l.props : c.inferred, accept: l.accept ?? [], mockOnly: typeof l.mockOnly === "boolean" ? l.mockOnly : guess, guessed: typeof l.mockOnly !== "boolean" && guess,
      ...(l.source ? { source: l.source } : {}), ...(l.target ? { target: l.target } : {}),
    };
  });
}

/**
 * The redesign of an existing component without a plan: the screen made from it compared with its baseline (the "as is" tree).
 * A component of the screen that the baseline has is a change of its file (Modify, or Keep / Remove when chosen); one the baseline does not have
 * is New (or Mockup only); the non-visual parts of the baseline and its visual ones missing from the screen are Keep (context) unless chosen otherwise.
 * Every entry of the baseline has `baseline: true`. `links`: the choices of the dialog (.studio/links.json).
 */
/** Components of the Plus4U libraries that a mockup draws with what they render: not a change of the component. */

/**
 * What a component renders itself: the components of its content down to the next component of its own (library wrappers are looked
 * through, the non-visual parts of the code are left out). `ownOnly`: only the components of its own (the root of a mockup simulates
 * states with library components that the code gets from elsewhere).
 */
export function directContent(n, { ownOnly = false } = {}) {
  const out = new Set();
  // Uu5Elements.Block in a mockup is Block imported in the code; containers of other libraries are drawn as what they render (a Block)
  const lib = (name) => { const n = name.split(".").pop(); return LIB_EQUIV[n] ?? n; };
  const w = (x) => { for (const c of x.children ?? []) {
    if (c.role && c.role !== "visual") { w(c); continue; } // providers, loaders, resolvers wrap the content: looked through, not counted
    const own = c.kind === "new" || c.kind === "existing";
    if (own) out.add(c.name); else { if (!ownOnly) out.add(lib(c.name)); w(c); }
  } };
  if (n) w(n);
  return out;
}

export function redesignComponents(screens, baseline, links = {}) {
  const known = new Map();
  const w = (n, chain) => { if (n.kind === "existing" && /^[A-Za-z_$][\w$.]*$/.test(n.name) && !known.has(n.name)) known.set(n.name, { node: n, chain }); (n.children ?? []).forEach((c) => w(c, [...chain, n.name])); };
  if (baseline) w(baseline, []);
  // the screens as the component's own structure (helpers out): a part of the code is changed only when its own content on the screen has something the code's does not
  const onScreen = new Map();
  for (const s of screens) {
    let t = null; try { t = componentView(normalizeTree(structureOf(s.html, s.file.replace(/\.html$/, ""))), { focus: baseline ? [baseline.name] : [] }); } catch { /* unreadable */ }
    const idx = (n) => { if ((n.kind === "new" || n.kind === "existing") && !onScreen.has(n.name)) onScreen.set(n.name, n); (n.children ?? []).forEach(idx); };
    if (t) idx(t);
  }
  const changeOf = (name, codeNode) => {
    const sn = onScreen.get(name); if (!sn) return null;
    const root = baseline && name === baseline.name;
    const code = directContent(codeNode, { ownOnly: root }), added = [...directContent(sn, { ownOnly: root })].filter((x) => !code.has(x) && !looksMockOnly({ name: x }));
    if (!added.length) return null;
    const own = added.filter((x) => onScreen.has(x)), libs = added.filter((x) => !onScreen.has(x)); // its own components by name, the library ones by count
    return own.length ? `adds ${own.join(", ")}${libs.length ? ` and ${libs.length} library component${libs.length === 1 ? "" : "s"}` : ""}` : `adds ${libs.join(", ")}`;
  };
  const fromScreens = screenComponents(screens, links), out = [], seen = new Set();
  const modeOf = (l, dflt) => (l.remove ? { remove: true } : l.keep ? { keep: true } : typeof l.keep === "boolean" || dflt === "modify" ? {} : { keep: true });
  for (const c of fromScreens) {
    const b = known.get(c.name);
    if (!b) { out.push(c); continue; } // new in the redesign (or a helper of the mockup)
    seen.add(c.name);
    const l = links[c.name] ?? {}, n = b.node, why = changeOf(c.name, n); // Modify only when its own content on the screen differs from the code, else Keep
    out.push({ ...c, baseline: true, mockOnly: false, guessed: false, source: l.source ?? n.source, ...(n.role ? { role: n.role } : {}), ...(why ? { why } : {}), props: Array.isArray(l.props) ? l.props : n.props?.length ? [...n.props, ...c.inferred.filter((p) => !n.props.some((q) => q.name === p.name))] : c.inferred, ...modeOf(l, why ? "modify" : "keep") });
  }
  for (const [name, { node: n, chain }] of known) { // the rest of the baseline: unchanged unless the dialog says otherwise
    if (seen.has(name) || !n.source) continue;
    const l = links[name] ?? {};
    out.push({ name, used: chain.length ? [chain.join(" › ")] : [], screens: [], inferred: [], props: Array.isArray(l.props) ? l.props : n.props ?? [], accept: l.accept ?? [], mockOnly: false, guessed: false, baseline: true, source: l.source ?? n.source, ...(n.role ? { role: n.role } : {}), ...(n.note ? { note: n.note } : {}), ...modeOf(l, "keep") });
  }
  return out;
}

/** A file of the repository that may be read (inside it, not a secret), or null. */
export function repoFile(repoDir, rel) {
  if (!repoDir || !rel || isSecretPath(rel)) return null;
  const p = path.resolve(repoDir, rel);
  return p.startsWith(path.resolve(repoDir) + path.sep) && fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
}
/** Components that change an existing file get what it declares now (`current`), the change of their interface (`diff`) and the file's hash. */
export function withRepo(components, repoDir) {
  return components.map((c) => {
    if (!c.source || c.mockOnly || c.remove || c.keep) return c;
    const f = repoFile(repoDir, c.source);
    if (!f) return { ...c, sourceMissing: true };
    const code = fs.readFileSync(f, "utf8"), current = repoComponentProps(code);
    return { ...c, current, diff: propsDiff(current, c.props), sourceHash: sha(code) };
  });
}

/** The section "Components to build" of HANDOFF.md. */
const ROLE_TEXT = { component: "non-visual component (createComponent): logic, no mockup", provider: "provider: gives data or a context to its children, no mockup", context: "context", hook: "hook: logic used by a component, no mockup", data: "data loading (useDataObject / useDataList with the calls named): no mockup", unknown: "not recognised in the code" };
export function componentsSection(all) {
  const components = all.filter((c) => !c.mockOnly && !c.remove && !c.keep), mock = all.filter((c) => c.mockOnly), removed = all.filter((c) => c.remove), kept = all.filter((c) => c.keep);
  const keepNote = kept.length ? ["## Unchanged (keep)", "", "These parts of the existing component stay as they are: do not refactor them, only connect the changes to them.", "", ...kept.map((c) => `- \`${c.name}\`${c.role && c.role !== "visual" ? ` (${c.role === "component" ? "non-visual" : c.role})` : ""}${c.source ? ` – \`${c.source}\`` : ""}`), ""] : [];
  const removeNote = removed.length ? ["## To remove", "", "The redesign drops these parts of the existing code (remove them and their files when nothing else uses them):", "", ...removed.map((c) => `- \`${c.name}\`${c.source ? ` – \`${c.source}\`` : ""}${c.note ? `: ${c.note}` : ""}`), ""] : [];
  const L = ["## Components to build", ""];
  const mockNote = mock.length ? ["## Only in the mockup (do not build)", "", "These components exist only so that the mockup can be shown (demo switches, simulated data). Leave them out of the real application.", "", ...mock.map((c) => `- \`${c.name}\`${c.note ? `: ${c.note}` : ""}`), ""] : [];
  if (!components.length) { L.push("No component of the plan is to be built: the screens below show what their own components do.", ""); return [...L, ...removeNote, ...keepNote, ...mockNote]; }
  L.push("Build these components for real: a new one is created, a changed one is modified in place. Where each is used is listed with it; the mockups show how they look.", "");
  for (const c of components) {
    L.push(`### \`${c.name}\``, "");
    if (c.note) L.push(c.note, "");
    const facts = [c.role && c.role !== "visual" && `- **Role:** ${ROLE_TEXT[c.role] ?? c.role}`, c.why && `- **What changes in it:** it ${c.why} (compared with its code)`, c.source ? `- **Change the existing component:** \`${c.source}\`${c.sourceMissing ? " (not found in the repository: check the path)" : ""} – modify it in place, keep its decomposition and its public interface unless listed below` : `- **New component**${c.target ? `: create \`${c.target}\`` : " – place it where the repository keeps components of this kind"}`, c.used.length && `- **Used in:** ${c.used.map((u) => `${u}`).join("; ")}`, c.relation && "- **Rendered:** once per item of a list (1:N)", c.render && `- **Rendered when:** ${c.render}`, c.disabled && `- **Disabled when:** ${c.disabled}`, c.data && `- **Data:** ${c.data}`].filter(Boolean);
    if (facts.length) L.push(...facts, "");
    const cell = (s) => String(s ?? "").replace(/\|/g, "\\|"), sig = (p) => `${p.type ?? "?"}${p.required ? ", required" : ""}${p.default ? `, default ${p.default}` : ""}`;
    if (c.diff) {
      const d = c.diff, lines = [...d.added.map((p) => `- **Add** \`${p.name}\` (${sig(p)})${p.desc ? ` – ${p.desc}` : ""}`), ...d.changed.map((x) => `- **Change** \`${x.name}\`: ${sig(x.from)} → ${sig({ ...x.from, ...x.to })}`), ...d.removed.map((p) => `- **Remove** \`${p.name}\` (${sig(p)})`)];
      L.push("Changes of the interface against the file:", "", ...(lines.length ? lines : ["- none: the props stay as they are"]), "");
    }
    if (c.props.length) {
      L.push("| Prop | Type | Required | Default | Description |", "| --- | --- | --- | --- | --- |", ...c.props.map((p) => `| \`${p.name}\` | ${cell(p.type) || "-"} | ${p.required ? "yes" : "no"} | ${p.default ? `\`${cell(p.default)}\`` : "-"} | ${cell(p.desc) || "-"} |`), "");
    } else L.push("_Props not specified: derive them from the plan and the mockup._", "");
    if (c.accept.length) L.push("Acceptance criteria:", "", ...c.accept.map((a) => `- [ ] ${a}`), "");
  }
  return [...L, ...removeNote, ...keepNote, ...mockNote];
}

/**
 * Every file of the package by its path in the repository: { "<path>": Uint8Array }.
 * data: { slug, project, date, appVersion, repo, handoff (the gathered spec), plan: { slug, title, text, tree } | null, mockups: { files, entries }, docs, shots: { "<screen>.png": Uint8Array } }
 */
export function packageFiles(data) {
  const dir = `${HANDOFF_ROOT}/${data.slug}`, out = {};
  const put = (rel, v) => { out[`${dir}/${rel}`] = typeof v === "string" ? strToU8(v) : v; };
  const all = data.components ?? componentsToBuild(data.plan?.tree), components = all.filter((c) => !c.mockOnly && !c.remove && !c.keep), mockOnly = all.filter((c) => c.mockOnly).map((c) => c.name), removed = all.filter((c) => c.remove), unchanged = all.filter((c) => c.keep).map((c) => c.name);
  const clean = (c) => { const { mockOnly: _m, guessed: _g, inferred: _i, baseline: _b, keep: _k, ...rest } = c; return { ...rest, mode: c.remove ? "remove" : c.source ? "modify" : "new" }; }; // eslint-disable-line no-unused-vars
  const hashes = Object.fromEntries((data.mockups?.files ?? []).map((f) => [f, sha(data.mockups.entries[f])]));
  const sections = [...componentsSection(all)];
  if (data.asIs?.tree) sections.push(`## The existing component as it is: ${data.asIs.tree.name}`, "", `\`${data.asIs.file}\` – its decomposition read from the code (non-visual parts included); the changes above are against it.`, "", "```", outlineText(data.asIs.tree), "```", "");
  if (data.exceptions?.length) sections.push("## Exceptions in the mockups", "", "Where the mockups differ from the library components of the code they come from. In the application use the real components.", "", ...data.exceptions.flatMap((x) => [`### ${x.file}`, "", ...x.lines.map((l) => `- ${l}`), ""]));
  if (data.plan) {
    sections.push(`## Plan: ${data.plan.title}`, "", data.plan.text || "", "");
    if (data.plan.tree) sections.push("### Component tree", "", "```", outlineText(data.plan.tree), "```", "");
  }
  const md = buildHandoff({ ...data.handoff, sections });
  put("HANDOFF.md", md);
  put("BUILD.md", buildInstructions({ slug: data.slug, project: data.project, components, mockOnly, removed, unchanged }));
  put("handoff.json", `${JSON.stringify({
    format: "uu5mock-handoff/1", slug: data.slug, project: data.project, created: data.date, app: data.appVersion ?? null, repo: data.repo ?? null,
    plan: data.plan ? { slug: data.plan.slug, title: data.plan.title, tree: data.plan.tree ?? null } : null,
    components: [...components, ...removed].map(clean), mockOnly, unchanged, screens: (data.mockups?.files ?? []).map((f) => ({ file: `mockups/${f}`, picture: data.shots?.[f.replace(/\.html$/, ".png")] ? `screens/${f.replace(/\.html$/, ".png")}` : null, hash: hashes[f] })),
  }, null, 2)}\n`);
  for (const [k, v] of Object.entries(data.mockups?.entries ?? {})) put(`mockups/${k}`, v);
  for (const [k, v] of Object.entries(data.shots ?? {})) put(`screens/${k}`, v);
  for (const [k, v] of Object.entries(data.docs ?? {})) put(`docs/${k}`, v);
  put("serve.mjs", SERVE.replace('"/index.html"', '"/mockups/index.html"'));
  put("mockups/index.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${data.project}</title><style>body{font:15px system-ui;margin:40px auto;max-width:560px}a{display:block;padding:8px 0}</style></head><body><h1>${data.project}</h1>${(data.mockups?.files ?? []).map((f) => `<a href="${encodeURIComponent(f)}">${f.replace(/\.html$/, "")}</a>`).join("")}</body></html>`);
  out[COMMAND_FILE] = strToU8(slashCommand());
  const title = data.plan?.title ?? (data.only?.length ? `the screen ${data.only.map((f) => f.replace(/\.html$/, "")).join(", ")}` : data.project);
  const prompt = handoffPrompt({ slug: data.slug, title, components, removed, unchanged, asIs: data.asIs?.tree?.name ?? null });
  put("PROMPT.md", `${prompt}\n`);
  return { files: out, components, hashes, prompt };
}

/** A short name for the package and its branch: at most 5 words of a title (a plan without a heading is titled by its first sentence). */
export const handoffSlug = (title) => slugify(String(title ?? "").split(/[:.!?–—(]/)[0].trim().split(/\s+/).slice(0, 5).join(" ")).slice(0, 40).replace(/-+$/, "") || "handoff";
/** The name of a plan's handoff: its screen (the root "Screen: course-detail" → course-detail), else its title, else the project. */
export function planHandoffSlug(plan, project) {
  const screen = /^\s*(?:screen|obrazovka)\s*:\s*(.+)$/i.exec(plan?.tree?.name ?? "")?.[1];
  return handoffSlug(screen || plan?.title || project);
}

/** The plan to hand over: the one asked for, else the newest approved one, else null. */
async function pickPlan(projectDir, slug) {
  if (slug) return readPlan(projectDir, slug);
  const dir = path.join(projectDir, "plans");
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".md")) : [];
  const plans = (await Promise.all(names.map((n) => readPlan(projectDir, n.replace(/\.md$/, "")).catch(() => null)))).filter(Boolean);
  return plans.filter((p) => p.status === "approved" || p.status === "built").sort((a, b) => String(b.meta.created ?? "").localeCompare(String(a.meta.created ?? "")))[0] ?? null;
}

/** Reads the project into the data of `packageFiles`. `shot(file)` → PNG Buffer of a screen, or null (optional). */
/** For a project made from code (a redesign, or a new component modelled on one): how each screen's library components differ from it. */
export async function screenExceptions(projectDir, screens) {
  const baselines = await readBaselines(projectDir).catch(() => []), r = baselines.length ? null : (await readReferences(projectDir).catch(() => []))[0];
  const ofScreen = baselines.length ? await screenBaselines(projectDir, baselines, screens.map((x) => x.file)) : null; // each screen against its own component
  const originOf = (file) => { const b = ofScreen?.get(file); return b ? { kind: "baseline", tree: b.tree, name: b.tree?.name, label: `${b.tree?.name ?? "the component"} in the code` } : r ? { kind: "reference", tree: r.tree, name: r.component, label: `the reference ${r.tree?.name ?? ""}`.trim() } : null; };
  const out = [];
  for (const { file, html } of screens) {
    const origin = originOf(file);
    if (!origin?.tree) continue;
    const full = structureOf(html, file.replace(/\.html$/, ""));
    if (!full) continue;
    const lines = deviationLines(libraryDeviations(origin.tree, componentView(normalizeTree(full), { focus: origin.name ? [origin.name] : [] }), html, { kind: origin.kind }), { origin: origin.label });
    if (lines.length) out.push({ file, origin: origin.label, lines });
  }
  return out;
}

export async function gatherPackage(projectDir, { project, planSlug = null, baseline = null, slug = null, repo = "", repoDir = null, appVersion = null, shot = null, only = null, date = new Date().toISOString().slice(0, 10) } = {}) {
  const p = planSlug === "@screens" || String(planSlug ?? "").startsWith("@redesign") ? null : await pickPlan(projectDir, planSlug); // "@screens": the components of the mockups, "@redesign": the screen against its baseline
  const extracted = p ? extractPlan(p.body) : null;
  const plan = p ? { slug: p.slug, title: p.title, text: extracted.text.replace(/^#{1,6}\s+.+\n+/, "").trim(), tree: extracted.tree } : null;
  const mockups = await mockupEntries(projectDir);
  if (only?.length) { // only some screens are handed over: the others and their own pictures stay out (the shared assets stay)
    const skip = mockups.files.filter((f) => !only.includes(f));
    mockups.files = mockups.files.filter((f) => only.includes(f));
    for (const f of skip) delete mockups.entries[f];
  }
  const shots = {};
  if (shot) for (const f of mockups.files) { const png = await shot(f).catch(() => null); if (png) shots[f.replace(/\.html$/, ".png")] = new Uint8Array(png); }
  const screens = mockups.files.map((f) => ({ file: f, html: fs.readFileSync(path.join(projectDir, f), "utf8") }));
  const components = withRepo(plan?.tree ? componentsToBuild(plan.tree) : baseline ? redesignComponents(screens, baseline.tree, readLinks(projectDir)) : screenComponents(screens, readLinks(projectDir)), repoDir);
  const exceptions = await screenExceptions(projectDir, screens);
  const named = only?.length === 1 && !plan ? only[0].replace(/\.html$/, "") : null; // one screen handed over: the package (and branch) is named after it
  return { components, ...(baseline && !plan ? { asIs: baseline } : {}), slug: slug || (named ? handoffSlug(named) : planHandoffSlug(plan ?? (baseline ? { title: baseline.tree?.name } : null), project)), project, date, appVersion, repo, plan, only: only ?? null, handoff: await gatherHandoff(projectDir, { project, repo, date, only }), exceptions, mockups, docs: await docEntries(projectDir), shots };
}
