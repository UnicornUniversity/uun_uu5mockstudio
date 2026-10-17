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
