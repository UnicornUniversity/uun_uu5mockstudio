import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Component reference (props, types, allowed values) read from the user's own Claude Code plugins: `uu5-development` (its uu5-knowledge
 * wiki: the uu5g05 generation) and `uu5bricks` (the registry pages of its uu5bricks-knowledge skill: Uu5Bricks and the other Bricks
 * libraries that documents are written with). Nothing is copied or bundled; without the plugins the inspector still works from the props
 * that exist in the file and at runtime.
 */

const WIKI = path.join("skills", "uu5-knowledge", "references", "wiki", "05-component-taxonomy-library-selection");
const BRICKS = path.join("skills", "uu5bricks-knowledge", "references", "uu5bricks-kb", "raw");
const TYPE_WORDS = new Set(["string", "bool", "number", "object", "func", "node", "lsi", "icon", "unit", "array", "any", "ref", "element", "colorScheme", "borderRadius"]);

/**
 * The folder `sub` of the plugin `plugin`: where Claude Code installed it, else in a marketplace synchronised by the uuAiMarketplace extension
 * (`marketplaceDirs`, default the uu5 one; not looked at when a `pluginsFile` is named), so that it also works for users of Codex alone.
 */
function findPluginDir(plugin, sub, { pluginsFile, marketplaceDirs } = {}) {
  const mps = marketplaceDirs ?? (pluginsFile ? [] : [path.join(os.homedir(), ".skilled-plus4u-mcp", "marketplaces", "uu-technical-products-mp")]);
  try {
    const reg = JSON.parse(fs.readFileSync(pluginsFile ?? path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json"), "utf8")).plugins ?? {};
    for (const [key, installs] of Object.entries(reg)) {
      if (key.split("@")[0] !== plugin) continue;
      for (const inst of [...installs].reverse()) {
        const dir = path.join(inst.installPath, sub);
        if (fs.existsSync(dir)) return dir;
      }
    }
  } catch { /* no Claude Code plugins installed */ }
  for (const mp of mps) { const dir = path.join(mp, "plugins", plugin, sub); if (fs.existsSync(dir)) return dir; }
  return null;
}

/** The wiki of the `uu5-development` plugin, or null. */
export const findWikiRoot = (opts) => findPluginDir("uu5-development", WIKI, opts);
/** The registry pages of the `uu5bricks` plugin (one markdown file per component), or null. */
export const findBricksRoot = (opts) => findPluginDir("uu5bricks", BRICKS, opts);

/**
 * A registry page of the uu5bricks plugin: `# Uu5Bricks.Tile`, a table with the npm package, `## Description`, and under `## Props` one
 * `### \`name\`` per prop followed by `` `type` · optional · default `value` `` (or `· **required**`). Same shape as `parseDoc`, plus `package`
 * and `deprecated`. null for a page that is not a component (the catalogue, the common props).
 */
export function parseBricksDoc(md) {
  const lines = String(md).split("\n");
  const title = (lines[0] ?? "").replace(/^#\s*/, "").trim();
  if (!/^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/.test(title)) return null;
  const meta = (key) => (md.match(new RegExp(`^\\|\\s*${key}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, "mi")) ?? [])[1] ?? "";
  const section = (name) => { const m = md.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m")); return m ? m[1] : ""; };
  const description = section("Description").trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  const url = (meta("Documentation").match(/https?:\S+/) ?? [])[0] ?? null;
  const props = [];
  for (const block of section("Props").split(/^### /m).slice(1)) {
    const name = ((block.match(/^`([^`]+)`/) ?? [])[1] ?? "").trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    const body = block.slice(block.indexOf("\n") + 1).trim();
    const head = body.match(/^`([^`]*)`\s*·\s*(\*\*required\*\*|optional)(?:\s*·\s*default\s*`([^`]*)`)?/);
    const type = head ? head[1].replace(/\|\|/g, "|").replace(/\s*\|\s*/g, " | ").trim() : "";
    const desc = (head ? body.slice(head[0].length) : body).replace(/\n\s*Example:[\s\S]*$/, "").replace(/\s+/g, " ").trim();
    const def = head?.[3]?.trim();
    props.push({
      name, type, required: head?.[2] === "**required**", default: !def || def === "undefined" ? null : unquote(def), description: desc,
      enum: enumOf(type.replace(/\s*\|\s*/g, "|"), desc), listEnum: listEnumOf(type, desc),
    });
  }
  return { title, description, url, props, package: meta("npm package").replace(/`/g, "") || null, deprecated: /\*\*yes\*\*/i.test(meta("Deprecated")) };
}

const splitRow = (line) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const unquote = (s) => s.trim().replace(/^[`"']+|[`"']+$/g, "");

/** Allowed values of a prop: from its type column (`xs | s | m`) or from "Available values are: `a`, `b`" in the description. */
export function enumOf(type, description = "") {
  const tokens = type.split("|").map((t) => unquote(t.replace(/`/g, "")));
  if (tokens.length > 1 && tokens.every((t) => /^[\w-]+$/.test(t) && !TYPE_WORDS.has(t))) return tokens;
  if (/^`?(string|oneOf(\(.*\))?|sizeOf\(string\))`?$/.test(type)) {
    // "Available values are: `a`, `b`", "One of `a`, `b`", "Possible values: - `a` - text - `b` - text", "State is one of: - `a` - `b`"
    if (/dependent on/i.test(description)) return null; // values depend on other props (e.g. Text segment/type): no fixed list
    const cue = description.match(/:\s+(?=-\s*`)|(?:available|possible|allowed|supported)\s+values?\b[^`\-]*|(?:^|[.:]\s*)one of\b[^`\-]*|\b(?:is|are) one of\s*:?|\bvalues?\s+(?=`)|\b(?:logo\s+)?types?\s*:|\bvalues?:/i);
    if (cue) {
      const rest = description.slice(cue.index + cue[0].length);
      const bullets = [...rest.matchAll(/(?:^|[\s:])-\s*`([\w:.-]+)`/g)].map((x) => x[1]);
      const inline = [...(rest.match(/^\s*((?:`[\w:.-]+`\s*(?:,|\band\b|\bor\b|\.)?\s*)+)/) ?? [])[1]?.matchAll(/`([\w:.-]+)`/g) ?? []].map((x) => x[1]);
      const vals = [...new Set(bullets.length > inline.length ? bullets : inline)];
      if (vals.length > 1) return vals;
    }
  }
  return null;
}

/**
 * Allowed items of a list prop (`array`, `string[]`, `oneOf[]`) when its description names them: `"area"`, `"box"` in quotes or
 * "Possible values: - `uve` - `route`". null when it names fewer than two (then any value is possible).
 */
export function listEnumOf(type, description = "") {
  if (!/^(array|string\[\]|oneOf(\(.*\))?\[\])$/i.test(String(type).trim().replace(/`/g, ""))) return null;
  const quoted = [...description.matchAll(/`["']([\w-]+)["']`/g)].map((m) => m[1]);
  const bullets = [...description.matchAll(/(?:^|[\s:])-\s*`([\w-]+)`/g)].map((m) => m[1]);
  const vals = [...new Set(quoted.length >= bullets.length ? quoted : bullets)];
  return vals.length > 1 ? vals : null;
}

export function parseDoc(md) {
  const lines = md.split("\n");
  const title = (lines[0] ?? "").replace(/^#\s*/, "").trim();
  const description = (lines.slice(1).find((l) => l.trim() && !l.startsWith(">") && !l.startsWith("Docs:")) ?? "").trim();
  // many links lack /book/page: they open the book's home page instead of the component page
  const url = ((md.match(/^Docs:\s*\[(https?:[^\]]+)\]/m) ?? [])[1] ?? null)?.replace(/(uu-bookkit-maing01\/[0-9a-f]+)\?code=/, "$1/book/page?code=") ?? null;
  const props = [];
  let inTable = false;
  for (const line of lines) {
    if (/^\|\s*Name\s*\|/i.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.startsWith("|")) { if (props.length) break; continue; }
    if (/^\|\s*-/.test(line)) continue;
    const [nameC, typeC = "", reqC = "", defC = "", ...rest] = splitRow(line);
    const name = unquote(nameC); if (!name) continue;
    const type = typeC.replace(/`/g, "").replace(/\s*\|\s*/g, " | ").trim(), desc = rest.join(" | ").trim();
    props.push({ name, type, required: /^yes/i.test(reqC), default: ["", "undefined"].includes(unquote(defC)) ? null : unquote(defC), description: desc, enum: enumOf(typeC.replace(/`/g, "").replace(/\s*\|\s*/g, "|"), desc), listEnum: listEnumOf(type, desc) });
  }
  return { title, description, url, props };
}

/**
 * `findWikiRoot()` result -> lookup for `Uu5Elements.Button` -> parsed doc (cached), plus the list / search used to pick components for the chat.
 * The components of the uu5bricks plugin (`bricksRoot`) come into the same lookup; called without arguments both plugins are looked for, with a
 * wiki given (tests) the bricks only when named.
 */
export function createDocs(...args) {
  const [wikiRoot = findWikiRoot(), { bricksRoot = args.length ? null : findBricksRoot() } = {}] = args;
  let index = null, summaries = null;
  const cache = new Map(), bricksFiles = new Set();
  function load() {
    if (index) return index;
    index = new Map();
    if (wikiRoot) {
      try {
        for (const dir of fs.readdirSync(wikiRoot, { withFileTypes: true })) {
          if (!dir.isDirectory()) continue;
          try {
            const map = JSON.parse(fs.readFileSync(path.join(wikiRoot, dir.name, "_index.json"), "utf8"));
            for (const [name, file] of Object.entries(map)) { index.set(name, path.join(wikiRoot, dir.name, file)) }
          } catch { /* folder without an index */ }
        }
      } catch { /* unreadable wiki */ }
    }
    if (bricksRoot) {
      try {
        for (const f of fs.readdirSync(bricksRoot).filter((n) => n.endsWith(".md")).sort()) {
          const file = path.join(bricksRoot, f);
          let first = "";
          try { first = fs.readFileSync(file, "utf8").split("\n", 1)[0].replace(/^#\s*/, "").trim(); } catch { continue; }
          if (!/^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/.test(first) || index.has(first)) continue; // the catalogue and the common props are not components
          index.set(first, file); bricksFiles.add(file);
        }
      } catch { /* unreadable registry */ }
    }
    return index;
  }
  const get = (name) => {
    if (cache.has(name)) return cache.get(name);
    const file = load().get(name);
    let doc = null;
    if (file) { try { const md = fs.readFileSync(file, "utf8"); doc = bricksFiles.has(file) ? parseBricksDoc(md) : parseDoc(md); } catch { doc = null; } }
    cache.set(name, doc);
    return doc;
  };
  /** Every documented component: [{ name, library, description }]; the library is the namespace the component is imported under (Uu5Elements, Plus4U5App …), not the wiki folder, sorted by name (read once, then cached). */
  function list() {
    if (summaries) return summaries;
    load();
    summaries = [...index.keys()].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, library: name.split(".")[0], description: get(name)?.description ?? "" }));
    return summaries;
  }
  return {
    available: () => load().size > 0,
    get,
    has: (name) => load().has(name),
    /** Path of the markdown file of a component (the agent reads it with the Read tool), or null. */
    file: (name) => load().get(name) ?? null,
    list,
    /** [{ library, count }] sorted by name. */
    libraries() {
      const n = new Map();
      for (const c of list()) n.set(c.library, (n.get(c.library) ?? 0) + 1);
      return [...n].map(([library, count]) => ({ library, count })).sort((a, b) => a.library.localeCompare(b.library));
    },
    /** Components whose name matches (a prefix of the name or of a part after a dot first, then any part), then those whose description does. */
    search(query, { library = "", limit = 50 } = {}) {
      const q = String(query ?? "").trim().toLowerCase(), all = list().filter((c) => !library || c.library === library);
      if (!q) return all.slice(0, limit);
      const rank = (c) => { const n = c.name.toLowerCase(), last = n.slice(n.lastIndexOf(".") + 1); return n === q || last === q ? 0 : n.startsWith(q) ? 1 : last.startsWith(q) ? 2 : n.includes(q) ? 3 : c.description.toLowerCase().includes(q) ? 4 : 9; };
      return all.map((c) => [rank(c), c]).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, c]) => c);
    },
  };
}

/** The part of a chat message that tells the agent what the mentioned library components are: description, docs, the file to read and the props. */
export function describeComponents(docs, names, { maxProps = 30 } = {}) {
  const blocks = [];
  for (const name of [...new Set(names)]) {
    const doc = docs.get(name); if (!doc) continue;
    const props = doc.props.slice(0, maxProps).map((p) => `  - ${p.name}${p.required ? " (required)" : ""}: ${p.enum ? p.enum.join(" | ") : p.type}${p.default ? ` = ${p.default}` : ""}`);
    const more = doc.props.length > maxProps ? `  - … ${doc.props.length - maxProps} more props in the file below` : null;
    blocks.push([`${name}${doc.description ? ` – ${doc.description}` : ""}`, doc.url && `  Docs: ${doc.url}`, docs.file(name) && `  Reference file (read it for the full list of props): ${docs.file(name)}`, props.length && "  Props:", ...props, more].filter(Boolean).join("\n"));
  }
  return blocks.length ? `Referenced library components (use exactly these names and props; read the reference file when you need more):\n${blocks.join("\n")}` : "";
}
