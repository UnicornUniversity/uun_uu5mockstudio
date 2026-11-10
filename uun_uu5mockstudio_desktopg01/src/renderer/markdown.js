/** Tiny safe markdown subset for chat messages: everything is HTML-escaped first. */
export const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a data-href="$2">$1</a>');
export function markdown(src) {
  const out = []; let list = null;
  const closeList = () => list && (out.push(`</${list}>`), (list = null));
  const parts = src.split(/```[^\n]*\n([\s\S]*?)(?:```|$)/);
  parts.forEach((part, i) => {
    if (i % 2) { closeList(); out.push(`<pre><code>${esc(part.replace(/\n$/, ""))}</code></pre>`); return; }
    for (const line of part.split("\n")) {
      let m;
      if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^#{1,6}\s+(.*)/))) { closeList(); out.push(`<h3>${inline(m[1])}</h3>`); }
      else if (line.trim()) { closeList(); out.push(`<p>${inline(line)}</p>`); }
      else closeList();
    }
    closeList();
  });
  return out.join("");
}

/**
 * The richer subset for documents (plans): headings h1-h4, nested lists (two spaces per level), checklists (`- [ ]` / `- [x]`),
 * tables, quotes and rules, and `[[screen.html]]` links that focus a screen. Everything is HTML-escaped first, like `markdown()`.
 * `known(file)` says whether a screen exists (a link to a missing one is shown plain).
 */
export function markdownDoc(src, { known = () => true } = {}) {
  const inl = (s) => inline(s).replace(/\[\[([\w.-]+\.html)\]\]/g, (_m, f) => (known(f) ? `<a data-screen="${f}">${f.replace(/\.html$/, "")}</a>` : `<code>${f}</code>`));
  const out = [];
  const parts = String(src ?? "").split(/```[^\n]*\n([\s\S]*?)(?:```|$)/);
  parts.forEach((part, i) => {
    if (i % 2) { out.push(`<pre><code>${esc(part.replace(/\n$/, ""))}</code></pre>`); return; }
    const lines = part.split("\n"); let stack = []; // open lists: [{ tag, indent }]
    const closeTo = (indent) => { while (stack.length && stack[stack.length - 1].indent >= indent) out.push(`</li></${stack.pop().tag}>`); };
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k]; let m;
      if ((m = line.match(/^(\s*)([-*]|\d+[.)])\s+(.*)/))) {
        const indent = m[1].replace(/\t/g, "  ").length, tag = /\d/.test(m[2]) ? "ol" : "ul";
        while (stack.length && stack[stack.length - 1].indent > indent) out.push(`</li></${stack.pop().tag}>`);
        const top = stack[stack.length - 1];
        if (top && top.indent === indent && top.tag === tag) out.push("</li>"); // the next item of the same list
        else { if (top && top.indent === indent) out.push(`</li></${stack.pop().tag}>`); out.push(`<${tag}>`); stack.push({ tag, indent }); } // a new (nested or other kind of) list
        const task = m[3].match(/^\[([ xX])\]\s+(.*)/);
        out.push(task ? `<li class="task"><input type="checkbox" disabled${task[1] === " " ? "" : " checked"} aria-label="${task[1] === " " ? "open" : "done"}"> ${inl(task[2])}` : `<li>${inl(m[3])}`);
        continue;
      }
      closeTo(0);
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[k + 1] ?? "")) { // a table: header, separator, rows
        const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => inl(c.trim()));
        const rows = []; let j = k + 2; while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) rows.push(cells(lines[j++]));
        out.push(`<table><thead><tr>${cells(line).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
        k = j - 1; continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*)/))) { const n = Math.min(4, m[1].length); out.push(`<h${n}>${inl(m[2])}</h${n}>`); }
      else if ((m = line.match(/^>\s?(.*)/))) out.push(`<blockquote>${inl(m[1])}</blockquote>`);
      else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) out.push("<hr>");
      else if (line.trim()) out.push(`<p>${inl(line)}</p>`);
    }
    closeTo(0);
  });
  return out.join("");
}
