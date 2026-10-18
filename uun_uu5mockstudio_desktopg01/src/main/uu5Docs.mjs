import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Component reference (props, types, allowed values) read from the user's own `uu5-development` Claude Code plugin
 * (its uu5-knowledge wiki). Nothing is copied or bundled; without the plugin the inspector still works from the props
 * that exist in the file and at runtime.
 */

const WIKI = path.join("skills", "uu5-knowledge", "references", "wiki", "05-component-taxonomy-library-selection");
const TYPE_WORDS = new Set(["string", "bool", "number", "object", "func", "node", "lsi", "icon", "unit", "array", "any", "ref", "element", "colorScheme", "borderRadius"]);

export function findWikiRoot({ pluginsFile = path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json") } = {}) {
  try {
    const reg = JSON.parse(fs.readFileSync(pluginsFile, "utf8")).plugins ?? {};
    for (const [key, installs] of Object.entries(reg)) {
      if (!/^uu5-development@/.test(key)) continue;
      for (const inst of [...installs].reverse()) {
        const dir = path.join(inst.installPath, WIKI);
        if (fs.existsSync(dir)) return dir;
      }
    }
  } catch { /* no Claude Code plugins installed */ }
  return null;
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

/** `findWikiRoot()` result -> lookup for `Uu5Elements.Button` -> parsed doc (cached), plus the list / search used to pick components for the chat. */
export function createDocs(wikiRoot = findWikiRoot()) {
  let index = null, summaries = null;
  const cache = new Map();
  const libOf = new Map(); // component name -> the wiki folder (library) it is documented in
  function load() {
    if (index) return index;
    index = new Map();
    if (!wikiRoot) return index;
    try {
      for (const dir of fs.readdirSync(wikiRoot, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        try {
          const map = JSON.parse(fs.readFileSync(path.join(wikiRoot, dir.name, "_index.json"), "utf8"));
          for (const [name, file] of Object.entries(map)) { index.set(name, path.join(wikiRoot, dir.name, file)); libOf.set(name, dir.name); }
        } catch { /* folder without an index */ }
      }
    } catch { /* unreadable wiki */ }
    return index;
  }
  const get = (name) => {
    if (cache.has(name)) return cache.get(name);
    const file = load().get(name);
    let doc = null;
    if (file) { try { doc = parseDoc(fs.readFileSync(file, "utf8")); } catch { doc = null; } }
    cache.set(name, doc);
    return doc;
  };
  /** Every documented component: [{ name, library, description }], sorted by name (read once, then cached). */
  function list() {
    if (summaries) return summaries;
    load();
    summaries = [...index.keys()].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, library: libOf.get(name), description: get(name)?.description ?? "" }));
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
