/**
 * The user guide inside the app (Help → User Guide…): the chapters of docs/user as sections, and the search over them.
 * Pure functions; the window is helpDialog.js, the files come from the main process (`help:docs`).
 */

/** The id of a heading, as GitHub makes it (the links between the chapters use these): lower case, no punctuation, spaces → "-". */
export function headingSlug(text) {
  return String(text ?? "").trim().toLowerCase().replace(/[`*_]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");
}

/** Markdown as plain text for searching and snippets: no marks, links as their text. */
export function plainText(md) {
  return String(md ?? "")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, "") // the separator line of a table
    .replace(/\|/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "")
    .replace(/[ \t]+/g, " ");
}

/** "8. Export and share" → "Export and share". */
const chapterTitle = (line, file) => (line ?? file.replace(/\.md$/, "")).replace(/^#\s+/, "").replace(/^\d+\.\s+/, "").trim();

/**
 * The chapters: `files` = [{ file, text }] of docs/user. README.md is the first one (Overview), the others by their file name
 * (01-…, 02-…). Each chapter has its sections: the text under the title and under each ## / ### heading, with the ids the
 * headings get on the page (a repeated heading gets -1, -2 like on GitHub).
 */
export function parseChapters(files) {
  const list = (files ?? []).filter((f) => f?.file?.endsWith(".md") && typeof f.text === "string");
  list.sort((a, b) => (a.file === "README.md" ? -1 : b.file === "README.md" ? 1 : a.file.localeCompare(b.file)));
  return list.map(({ file, text }) => {
    const lines = text.split("\n"), first = lines.find((l) => /^#\s/.test(l));
    const title = file === "README.md" ? "Overview" : chapterTitle(first, file);
    const sections = [], seen = new Map();
    let cur = { id: "", title, level: 1, lines: [] }, fence = false;
    for (const line of lines) {
      if (/^```/.test(line)) fence = !fence;
      const m = !fence && line.match(/^(#{1,4})\s+(.*)/);
      if (m && m[1].length === 1 && line === first) continue; // the title of the chapter
      if (m) {
        sections.push(cur);
        const base = headingSlug(m[2]), n = seen.get(base) ?? 0; seen.set(base, n + 1);
        cur = { id: n ? `${base}-${n}` : base, title: plainText(m[2]).trim(), level: m[1].length, lines: [] };
      } else cur.lines.push(line);
    }
    sections.push(cur);
    return { file, title, text, sections: sections.map(({ lines: l, ...s }) => ({ ...s, text: plainText(l.join("\n")).replace(/\n{2,}/g, "\n").trim() })).filter((s) => s.text || s.id) };
  });
}

/** The words of a query (two letters or more), lower case, without accents. */
const fold = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
export const STOP = new Set("a an and are as at be by can do for from has have how i in is it its my of on or the this to what when where which with you your".split(" "));
/** Common words (from, the, of…) are left out unless the query has nothing else. */
export function queryWords(q) {
  const all = [...new Set(fold(q).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))], kept = all.filter((w) => !STOP.has(w));
  return kept.length ? kept : all;
}

/** A piece of the text around the first word found, about `size` characters, with … where it is cut. */
export function snippet(text, words, size = 160) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim(), f = fold(t);
  const at = Math.min(...words.map((w) => f.indexOf(w)).filter((i) => i >= 0).concat([Infinity]));
  if (!Number.isFinite(at) || t.length <= size) return t.slice(0, size) + (t.length > size ? "…" : "");
  let start = Math.max(0, at - Math.round(size / 3)); if (start > 0) { const sp = t.indexOf(" ", start); if (sp > 0 && sp < at) start = sp + 1; }
  let end = Math.min(t.length, start + size); if (end < t.length) { const sp = t.lastIndexOf(" ", end); if (sp > at) end = sp; }
  return `${start > 0 ? "…" : ""}${t.slice(start, end)}${end < t.length ? "…" : ""}`;
}

/**
 * The sections that contain every word of the query (the title of the chapter counts too), best first: words in the heading weigh
 * the most, then a phrase found as it was typed, then how often the words occur. → [{ file, chapter, id, title, snippet, score }].
 */
export function searchDocs(chapters, query, { limit = 40 } = {}) {
  const words = queryWords(query);
  if (!words.length) return [];
  const phrase = fold(query).trim().replace(/\s+/g, " "), out = [];
  for (const ch of chapters ?? []) {
    for (const s of ch.sections) {
      const head = fold(`${s.title} ${ch.title}`), body = fold(s.text), all = `${head} ${body}`;
      if (!words.every((w) => all.includes(w))) continue;
      let score = 0;
      for (const w of words) {
        if (fold(s.title).includes(w)) score += 10; else if (head.includes(w)) score += 3;
        score += Math.min(5, body.split(w).length - 1);
      }
      if (words.length > 1 && all.includes(phrase)) score += 8;
      if (s.level === 1) score -= 1; // the introduction of a chapter is less exact than its sections
      out.push({ file: ch.file, chapter: ch.title, id: s.id, title: s.level === 1 ? ch.title : s.title, snippet: snippet(s.text, words), score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * The index for the search field of the macOS Help menu (native/helpsearch): one entry per section, `key` = "<file>#<id>" (the
 * introduction of a chapter: "<file>"), `label` = what Help Topics shows ("Update from code — Export and share").
 */
export function helpSearchEntries(chapters) {
  return (chapters ?? []).flatMap((c) => c.sections.map((s) => {
    const own = s.level > 1;
    return { key: own ? `${c.file}#${s.id}` : c.file, title: own ? s.title : c.title, chapter: c.title, text: s.text, label: own ? `${s.title} — ${c.title}` : c.title };
  }));
}
