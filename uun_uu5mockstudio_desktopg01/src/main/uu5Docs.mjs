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
    props.push({ name, type, required: /^yes/i.test(reqC), default: ["", "undefined"].includes(unquote(defC)) ? null : unquote(defC), description: desc, enum: enumOf(typeC.replace(/`/g, "").replace(/\s*\|\s*/g, "|"), desc) });
  }
  return { title, description, url, props };
}

/** `findWikiRoot()` result -> lookup for `Uu5Elements.Button` -> parsed doc (cached). */
export function createDocs(wikiRoot = findWikiRoot()) {
  let index = null;
  const cache = new Map();
  function load() {
    if (index) return index;
    index = new Map();
    if (!wikiRoot) return index;
    try {
      for (const dir of fs.readdirSync(wikiRoot, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        try {
          const map = JSON.parse(fs.readFileSync(path.join(wikiRoot, dir.name, "_index.json"), "utf8"));
          for (const [name, file] of Object.entries(map)) index.set(name, path.join(wikiRoot, dir.name, file));
        } catch { /* folder without an index */ }
      }
    } catch { /* unreadable wiki */ }
    return index;
  }
  return {
    available: () => load().size > 0,
    get(name) {
      if (cache.has(name)) return cache.get(name);
      const file = load().get(name);
      let doc = null;
      if (file) { try { doc = parseDoc(fs.readFileSync(file, "utf8")); } catch { doc = null; } }
      cache.set(name, doc);
      return doc;
    },
  };
}
