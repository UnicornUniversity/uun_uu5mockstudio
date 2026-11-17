import fs from "node:fs";
import path from "node:path";
import { findAssets } from "./assets.mjs";
import { readRules, writeRules, readProject, writeProject, notePath, nextRuleId, TEMPLATE } from "./rules.mjs";
import { getScreenText, setScreenText } from "../renderer/projectDoc.js";

/**
 * Copy / paste of a screen between projects. A screen is more than its .html: it takes its media files, its notes, its business rules
 * (its `## Screen:` section and `(screen: name)` items elsewhere) and its description in PROJECT.md. `bundleScreen` snapshots all of it
 * when the screen is copied; `pasteScreen` writes it into a project under a free name, renumbers the rules, keeps a media file that is
 * already there with the same content and renames one with different content (the reference in the screen is rewritten).
 * Comments are a discussion of the original and stay with it; so do the sitemap, the chats and the plans.
 */

const stem = (file) => String(file).replace(/\.html$/i, "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A mockup pasted as plain text: an HTML document with a babel script (what Copy HTML puts on the clipboard). */
export const looksLikeScreen = (text) => /<script[^>]*type=["']text\/babel["']/i.test(String(text ?? "")) && /<\/html>|<\/script>/i.test(String(text));

/** The rules of a screen: the body of its `## Screen: <name>` section and `- R-nnn (screen: <name>) …` items elsewhere (not in code blocks). */
export function screenRules(md, screen) {
  const name = stem(screen).trim().toLowerCase(), out = [];
  let inside = false, code = false;
  for (const line of String(md ?? "").split("\n")) {
    if (/^\s*```/.test(line)) code = !code;
    if (!code && /^##\s/.test(line)) { const m = line.match(/^##\s+Screen:\s*(.+?)\s*$/i); inside = Boolean(m && m[1].trim().toLowerCase() === name); continue; }
    const own = !code && /^\s*[-*]\s+R-\d+\s+\(screen:\s*([^)]*)\)/.exec(line);
    if (inside || (own && own[1].trim().toLowerCase() === name)) out.push(line);
  }
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out.at(-1).trim()) out.pop();
  return out.join("\n");
}

/** Adds copied rule lines as a `## Screen: <screen>` section of `md`: every `R-nnn` gets the next free id of `md`, `(screen: x)` names the new screen. */
export function addScreenRules(md, screen, lines) {
  const body = String(lines ?? "").trim();
  if (!body) return { md: String(md ?? ""), count: 0 };
  const before = String(md ?? "").trim() ? String(md) : TEMPLATE;
  let n = Number(nextRuleId(before, "R").slice(2)), count = 0;
  const renamed = body.split("\n").map((l) => {
    const m = /^(\s*[-*]\s+)R-\d+\b(\s+\(screen:\s*[^)]*\))?/.exec(l);
    if (!m) return l;
    count++;
    return `${m[1]}R-${String(n++).padStart(3, "0")} (screen: ${screen})${l.slice(m[0].length)}`;
  });
  return { md: `${before.replace(/\s+$/, "")}\n\n## Screen: ${screen}\n\n${renamed.join("\n")}\n`, count };
}

/** Everything a pasted screen needs, read from the project at the time of the copy. */
export async function bundleScreen(projectDir, file) {
  const name = path.basename(String(file));
  if (!name.endsWith(".html")) throw new Error("Only a screen (.html) can be copied.");
  const html = await fs.promises.readFile(path.join(projectDir, name), "utf8");
  const media = [];
  for (const a of await findAssets(projectDir, [html])) media.push({ ref: a.ref, rel: a.rel, data: (await fs.promises.readFile(a.file)).toString("base64") });
  let notes = ""; try { notes = await fs.promises.readFile(notePath(projectDir, name), "utf8"); } catch { /* no notes */ }
  return { kind: "uu5mock-screen", version: 1, project: path.basename(projectDir), file: name, html, media, notes, rules: screenRules(await readRules(projectDir), name), description: getScreenText(await readProject(projectDir), stem(name)) };
}

/** A bundle of a screen that came only as HTML text (copied elsewhere): no media, notes, rules or description. */
export function bundleFromHtml(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  const slug = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return { kind: "uu5mock-screen", version: 1, project: null, file: `${slug || "pasted-screen"}.html`, html: String(html), media: [], notes: "", rules: "", description: "" };
}

/** `name.html`, else `name-2.html`, `name-3.html` … whichever is free (case-insensitive, like the file system of a Mac). */
export function freeName(file, taken) {
  const low = new Set([...taken].map((t) => String(t).toLowerCase())), base = stem(path.basename(file)).replace(/-\d+$/, "") || "screen";
  if (!low.has(path.basename(file).toLowerCase())) return path.basename(file);
  for (let i = 2; ; i++) if (!low.has(`${base}-${i}.html`)) return `${base}-${i}.html`;
}

/** Names of other screens a screen links to (`href="detail.html"`, `navigate("detail.html")` …). */
export const screenLinks = (html) => [...new Set([...String(html).matchAll(/["'`(/=]([\w.-]+\.html)(?=[?#"'`)\s]|$)/g)].map((m) => m[1]))];

/**
 * Writes a bundle into `projectDir`. -> { file, renamedFrom, media: copied, mediaRenamed, rules, description, notes, missingLinks, from }
 */
export async function pasteScreen(projectDir, bundle) {
  if (bundle?.kind !== "uu5mock-screen" || typeof bundle.html !== "string") throw new Error("The clipboard holds no screen.");
  const entries = await fs.promises.readdir(projectDir);
  const file = freeName(bundle.file, entries.filter((f) => f.endsWith(".html")).concat(entries.filter((f) => f.endsWith(".notes.md")).map((f) => `${f.slice(0, -9)}.html`)));
  let html = bundle.html;
  const newStem = stem(file);
  if (file !== bundle.file) html = html.replace(new RegExp(`(["'\`(/=])${escapeRe(bundle.file)}(?=[?#"'\`)\\s]|$)`, "g"), `$1${file}`); // links of the screen to itself

  // media: the same path with the same bytes is kept, a different file with that path gets a free name and the reference follows it
  let copied = 0; const mediaRenamed = [];
  const root = path.resolve(projectDir);
  for (const m of bundle.media ?? []) {
    const data = Buffer.from(String(m.data), "base64");
    let rel = String(m.rel);
    const at = (r) => path.resolve(projectDir, r);
    if (!at(rel).startsWith(root + path.sep)) continue;
    const same = (r) => { try { return fs.readFileSync(at(r)).equals(data); } catch { return false; } };
    if (fs.existsSync(at(rel)) && !same(rel)) {
      const ext = path.extname(rel), base = rel.slice(0, rel.length - ext.length);
      let i = 2; while (fs.existsSync(at(`${base}-${i}${ext}`)) && !same(`${base}-${i}${ext}`)) i++;
      const to = `${base}-${i}${ext}`, fromBase = path.posix.basename(rel), toBase = path.posix.basename(to);
      const ref = String(m.ref), newRef = ref.slice(0, ref.length - fromBase.length) + toBase;
      if (ref.endsWith(fromBase)) { html = html.replace(new RegExp(`(^|[^\\w./-])${escapeRe(ref)}(?![\\w-])`, "g"), (_, pre) => pre + newRef); mediaRenamed.push({ from: rel, to }); rel = to; }
    }
    if (!fs.existsSync(at(rel))) { await fs.promises.mkdir(path.dirname(at(rel)), { recursive: true }); await fs.promises.writeFile(at(rel), data); copied++; }
  }

  await fs.promises.writeFile(path.join(projectDir, file), html);

  let notes = 0;
  if (String(bundle.notes ?? "").trim()) {
    const text = String(bundle.notes).replace(/^#\s*Notes:[^\n]*/i, `# Notes: ${newStem}`);
    await fs.promises.writeFile(notePath(projectDir, file), text);
    notes = (text.match(/<!--\s*note\s+[\w-]+\s*-->/g) ?? []).length || 1;
  }
  let rules = 0;
  if (String(bundle.rules ?? "").trim()) { const r = addScreenRules(await readRules(projectDir), newStem, bundle.rules); await writeRules(projectDir, r.md); rules = r.count; }
  const description = String(bundle.description ?? "").trim();
  if (description) await writeProject(projectDir, setScreenText(await readProject(projectDir), newStem, description));

  const present = new Set((await fs.promises.readdir(projectDir)).map((f) => f.toLowerCase()));
  const missingLinks = screenLinks(html).filter((l) => l !== file && l !== bundle.file && !present.has(l.toLowerCase()));
  return { file, renamedFrom: file !== bundle.file ? bundle.file : null, media: copied, mediaRenamed, rules, description: Boolean(description), notes, missingLinks, from: bundle.project ?? null };
}
