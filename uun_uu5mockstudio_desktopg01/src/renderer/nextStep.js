/** The suggested next step the agent puts at the end of its answer (`<next-step>…</next-step>`, see NEXT_STEP_RULE in src/main/claudeService.mjs). */
const MAX = 140;
const OPEN = "<next-step>";

/**
 * Split an answer into the text to show and the suggestion.
 * While the answer streams in, an unfinished tag at its end (`<next-st`, `<next-step>Add a fil`) is hidden too.
 * @returns {{ body: string, next: string | null }}
 */
export function splitNextStep(text) {
  let s = String(text ?? ""), next = null;
  const re = /<next-step>([\s\S]*?)<\/next-step>/gi;
  for (const m of s.matchAll(re)) next = m[1];
  s = s.replace(re, "");
  const open = s.toLowerCase().lastIndexOf(OPEN);
  if (open >= 0) s = s.slice(0, open); // the tag has started, its end has not come yet
  else {
    const tail = s.match(/<[a-z-]*$/i); // the first characters of the tag
    if (tail && OPEN.startsWith(tail[0].toLowerCase())) s = s.slice(0, tail.index);
  }
  if (next != null) {
    next = next.replace(/\s+/g, " ").trim().replace(/^["„“”'`]+|["„“”'`]+$/g, "").trim();
    if (next.length > MAX) next = `${next.slice(0, MAX - 1).trimEnd()}…`;
    if (!next) next = null;
  }
  return { body: s.replace(/\s+$/, ""), next };
}
