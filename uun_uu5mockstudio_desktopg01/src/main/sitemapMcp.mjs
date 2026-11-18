import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readSitemap, writeSitemap } from "./sitemapFile.mjs";
import { sitemapOutline, applyLinks, applyEdits, normalizeSitemap, countNodes } from "../renderer/sitemap.js";

const text = (t) => ({ content: [{ type: "text", text: t }] });
/** The tools that change the sitemap: denied in planning mode (claudeService PLAN_DENIED). */
export const SITEMAP_WRITE_TOOLS = ["mcp__studio-browser__sitemap_links", "mcp__studio-browser__sitemap_edit"];

/**
 * The sitemap of the project for the agent: `sitemap_read` (the whole map with the ids of its nodes), `sitemap_edit` (add, change, move and remove pages and groups)
 * and `sitemap_links` (one page shown at several places: a copy becomes a link to the original, or a link is added). The file is written by the app (the previous version is kept, the user can take it back),
 * never by the agent itself. `projectDir()` = the folder of the open project.
 */
export function sitemapTools({ projectDir }) {
  const load = async () => { const dir = projectDir?.(); const r = dir ? await readSitemap(dir) : null; return r ? { dir, sm: r.sitemap } : null; };
  /** Saves a changed map (the previous one is kept) and tells the agent what was done and skipped. */
  const save = async (m, r) => {
    if (r.done.length && countNodes(normalizeSitemap(r.sitemap)) !== countNodes(r.sitemap)) return text("Nothing was changed: the map would be too big to save whole (at most 200 pages and 200 links)."); // never lose a page silently
    if (r.done.length) await writeSitemap(m.dir, r.sitemap, { backup: true });
    return text([`Done (${r.done.length}):`, ...r.done.map((d) => `- ${d}`), ...(r.skipped.length ? [`Skipped (${r.skipped.length}):`, ...r.skipped.map((d) => `- ${d}`)] : []), r.done.length ? "The map is saved; the user sees it at once and can take the change back." : "Nothing was changed."].join("\n"));
  };
  const where = { under: z.string().optional().describe("id of the node to put it inside (as its last child)"), before: z.string().optional().describe("id of the node to put it right before"), after: z.string().optional().describe("id of the node to put it right after") };
  return [
    tool("sitemap_read", "The sitemap of this project (sitemap.json) as an outline with the id of every node {id: …}, its type, screen file, note and source; a link shows the page it stands for. Read it before sitemap_edit or sitemap_links: the ids are needed there.",
      {},
      async () => { const m = await load(); return text(m ? sitemapOutline(m.sm, { ids: true, limit: 60000 }) : "This project has no sitemap."); }),
    tool("sitemap_edit", "Change the structure of the sitemap of this project: add pages, groups, sheets, sections or external links, rename them or change their type, note or screen file, move them (with their sub-pages) to another place, and remove them. `ops` run in order; an `add` reports the id of the new node, and a later op of the same call may use it when you give the new node your own `id`. E.g. a new group with three pages moved into it: [{op:\"add\", title:\"Odborná praxe\", type:\"group\", id:\"praxe\", after:\"<id>\"}, {op:\"move\", node:\"<id>\", under:\"praxe\"}, …]. Use the ids from sitemap_read. Call it when the user asks to change the map, or when a plan that changes the map is built. Approved nodes are not renamed, retyped, moved or removed; removing a page never deletes its screen file. The result lists what was done and what was skipped and why. The app keeps the previous map: the user can take the change back on the sitemap.",
      {
        ops: z.array(z.object({
          op: z.enum(["add", "update", "move", "remove"]),
          node: z.string().optional().describe("update / move / remove: id of the node"),
          title: z.string().optional().describe("add: the name (required); update: the new name"),
          type: z.enum(["page", "sheet", "section", "group", "external"]).optional().describe("add / update; for add it defaults to what fits the place"),
          id: z.string().optional().describe("add: the id you want for the new node (made unique), to refer to it in later ops"),
          note: z.string().optional(), file: z.string().optional().describe("the screen file, kebab-name.html"), notSolved: z.boolean().optional(),
          ...where,
        })).min(1),
      },
      async ({ ops }) => {
        try { const m = await load(); if (!m) return text("This project has no sitemap."); return await save(m, applyEdits(m.sm, ops)); }
        catch (e) { return text(`Cannot change the sitemap: ${e.message}`); }
      }),
    tool("sitemap_links", "Show one page at several places of the sitemap of this project: a page (a sheet, a regulation, an external document) that belongs under several portals is kept ONCE (the original, the primary place) and every other place becomes a LINK to it (it shows the original's name, type and screen; renaming the original renames it everywhere). `replace`: nodes that are copies of the same page at other places become links to `original`, in their place. `add`: the original is shown once more inside `under`. `primary`: a page that is only at a secondary place moves into its primary place and a link to it stays where it was. Use the ids from sitemap_read. Call it only when the user asks to change the map. Approved nodes are not changed; the result lists what was done and what was skipped and why. The app keeps the previous map: the user can take the change back on the sitemap.",
      {
        replace: z.array(z.object({ node: z.string().describe("id of the copy that becomes a link"), original: z.string().describe("id of the original (the primary place)"), dropSubPages: z.boolean().optional().describe("true when the copy has sub-pages that are the same as the original's: they go with it") })).optional(),
        add: z.array(z.object({ original: z.string(), under: z.string().describe("id of the node to show the original inside") })).optional(),
        primary: z.array(z.object({ node: z.string().describe("id of a page that is only at a secondary place"), under: z.string().describe("id of its primary place (e.g. the portal of internal regulations)") })).optional().describe("the page moves to its primary place and a link to it stays where it was; done before replace and add"),
      },
      async ({ replace = [], add = [], primary = [] }) => {
        try {
          const m = await load(); if (!m) return text("This project has no sitemap.");
          return await save(m, applyLinks(m.sm, { replace, add, primary }));
        } catch (e) { return text(`Cannot change the sitemap: ${e.message}`); }
      }),
  ];
}
