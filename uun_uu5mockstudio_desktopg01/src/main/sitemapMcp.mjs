import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readSitemap, writeSitemap } from "./sitemapFile.mjs";
import { sitemapOutline, applyLinks, normalizeSitemap, countNodes } from "../renderer/sitemap.js";

const text = (t) => ({ content: [{ type: "text", text: t }] });
/** The tools that change the sitemap: denied in planning mode (claudeService PLAN_DENIED). */
export const SITEMAP_WRITE_TOOLS = ["mcp__studio-browser__sitemap_links"];

/**
 * The sitemap of the project for the agent: `sitemap_read` (the whole map with the ids of its nodes) and `sitemap_links` (one page shown at several places:
 * a copy becomes a link to the original, or a link is added). The file is written by the app (the previous version is kept, the user can take it back),
 * never by the agent itself. `projectDir()` = the folder of the open project.
 */
export function sitemapTools({ projectDir }) {
  const load = async () => { const dir = projectDir?.(); const r = dir ? await readSitemap(dir) : null; return r ? { dir, sm: r.sitemap } : null; };
  return [
    tool("sitemap_read", "The sitemap of this project (sitemap.json) as an outline with the id of every node {id: …}, its type, screen file, note and source; a link shows the page it stands for. Read it before sitemap_links: the ids are needed there.",
      {},
      async () => { const m = await load(); return text(m ? sitemapOutline(m.sm, { ids: true, limit: 60000 }) : "This project has no sitemap."); }),
    tool("sitemap_links", "Show one page at several places of the sitemap of this project: a page (a sheet, a regulation, an external document) that belongs under several portals is kept ONCE (the original, the primary place) and every other place becomes a LINK to it (it shows the original's name, type and screen; renaming the original renames it everywhere). `replace`: nodes that are copies of the same page at other places become links to `original`, in their place. `add`: the original is shown once more inside `under`. `primary`: a page that is only at a secondary place moves into its primary place and a link to it stays where it was. Use the ids from sitemap_read. Call it only when the user asks to change the map. Approved nodes are not changed; the result lists what was done and what was skipped and why. The app keeps the previous map: the user can take the change back on the sitemap.",
      {
        replace: z.array(z.object({ node: z.string().describe("id of the copy that becomes a link"), original: z.string().describe("id of the original (the primary place)"), dropSubPages: z.boolean().optional().describe("true when the copy has sub-pages that are the same as the original's: they go with it") })).optional(),
        add: z.array(z.object({ original: z.string(), under: z.string().describe("id of the node to show the original inside") })).optional(),
        primary: z.array(z.object({ node: z.string().describe("id of a page that is only at a secondary place"), under: z.string().describe("id of its primary place (e.g. the portal of internal regulations)") })).optional().describe("the page moves to its primary place and a link to it stays where it was; done before replace and add"),
      },
      async ({ replace = [], add = [], primary = [] }) => {
        try {
          const m = await load(); if (!m) return text("This project has no sitemap.");
          const r = applyLinks(m.sm, { replace, add, primary });
          if (r.done.length && countNodes(normalizeSitemap(r.sitemap)) !== countNodes(r.sitemap)) return text("Nothing was changed: the map would be too big to save whole (at most 200 pages and 200 links)."); // never lose a page silently
          if (r.done.length) await writeSitemap(m.dir, r.sitemap, { backup: true });
          return text([`Done (${r.done.length}):`, ...r.done.map((d) => `- ${d}`), ...(r.skipped.length ? [`Skipped (${r.skipped.length}):`, ...r.skipped.map((d) => `- ${d}`)] : []), r.done.length ? "The map is saved; the user sees it at once and can take the change back." : "Nothing was changed."].join("\n"));
        } catch (e) { return text(`Cannot change the sitemap: ${e.message}`); }
      }),
  ];
}
