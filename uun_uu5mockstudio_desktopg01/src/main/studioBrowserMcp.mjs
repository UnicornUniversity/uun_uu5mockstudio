import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import path from "node:path";
import { webContents, nativeImage } from "electron";
import { captureWithFallback } from "./screenshot.mjs";
import { clickIn } from "./mockClick.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (t) => ({ content: [{ type: "text", text: t }] });
const LEVELS = ["verbose", "info", "warning", "error"];
const NOISE = /Electron Security Warning|^uu5\w+-[\d.]+ ©|Terms of Use:|^__studio_pick__/;
const fileParam = z.string().optional().describe("Mockup .html file name. Defaults to the one used last.");

/**
 * In-process MCP server that lets the agent verify what the app preview really renders.
 * The canvas shows one <webview> per mockup file; the renderer registers each via `register(file, id)`.
 */
export function createStudioBrowser({ baseUrl, onNavigated }) {
  const views = new Map(); // file -> webContents id
  const logs = new Map(); // webContents id -> [{level,text}]
  let lastFile;

  const register = (file, id) => {
    views.set(file, id);
    const wc = webContents.fromId(id);
    if (!wc || logs.has(id)) return;
    logs.set(id, []);
    wc.on("did-start-navigation", (_e, _url, _inPlace, isMainFrame) => isMainFrame && (logs.get(id).length = 0));
    wc.on("console-message", (...args) => {
      const d = args[0]?.message !== undefined ? args[0] : { level: args[1], message: args[2] };
      if (NOISE.test(d.message)) return;
      const level = typeof d.level === "number" ? LEVELS[d.level] ?? "info" : d.level;
      logs.get(id).push({ level, text: String(d.message).split("\n").filter((l) => !/^\s+at /.test(l)).join("\n").slice(0, 700) });
    });
    wc.once("destroyed", () => logs.delete(id));
  };
  const unregister = (file) => views.delete(file);

  const norm = (f) => (f ? path.basename(f) : f);
  const resolve = async (file, { wait = false } = {}) => {
    const name = norm(file) ?? lastFile;
    if (!name) throw new Error("No mockup selected. Pass `file` (e.g. 'user-form.html').");
    for (let i = 0; i < (wait ? 80 : 1); i++) {
      const wc = views.has(name) ? webContents.fromId(views.get(name)) : undefined;
      if (wc && !wc.isDestroyed()) { lastFile = name; return { name, wc, buf: logs.get(wc.id) ?? [] }; }
      await sleep(250);
    }
    throw new Error(`Mockup '${name}' is not shown in the preview${wait ? " (file missing or page failed to open)" : ""}. Existing: ${[...views.keys()].join(", ") || "none"}.`);
  };

  const rendered = (wc) => wc.executeJavaScript(`document.getElementById("uu5")?.children.length ?? 0`).catch(() => 0);
  const waitRendered = async (wc) => {
    if (wc.isLoading()) await new Promise((r) => { wc.once("did-stop-loading", r); setTimeout(r, 30000); });
    for (let i = 0; i < 40 && !(await rendered(wc)); i++) await sleep(500);
    await sleep(800);
  };
  const status = async ({ name, wc, buf }) => {
    const n = await rendered(wc);
    return `file: ${name}\nrendered: ${n > 0 ? "yes" : "NO (#uu5 is empty - the page crashed or failed to load)"}\nconsole errors: ${buf.filter((m) => m.level === "error").length}, warnings: ${buf.filter((m) => m.level === "warning").length}`;
  };

  /** Visible text plus the interactive elements of the page (shared by browser_snapshot and browser_click). */
  const snapshotText = async (wc, name) => {
    const snap = await wc.executeJavaScript(`(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const label = (e) => (e.getAttribute("aria-label") || e.innerText || e.value || e.placeholder || e.name || "").trim().slice(0, 60);
      const items = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [role=tab]")].filter(vis)
        .map((e) => e.tagName.toLowerCase() + (e.type ? "[" + e.type + "]" : "") + ": " + label(e));
      return { title: document.title, text: document.body.innerText.slice(0, 4000), items: items.slice(0, 80) };
    })()`);
    return `file: ${name}\ntitle: ${snap.title}\n\nVISIBLE TEXT:\n${snap.text}\n\nINTERACTIVE:\n${snap.items.join("\n")}`;
  };

  const tools = [
    tool("browser_open", "Show a mockup (the .html file name in the project folder, e.g. 'user-form.html') on the app canvas, reload it, wait until uu5 has rendered, and report render status and console error count. The file must already exist.",
      { file: z.string().describe("File name of the .html screen in the project folder") },
      async ({ file }) => {
        const t = await resolve(file, { wait: true });
        onNavigated?.(t.name);
        t.buf.length = 0;
        t.wc.reloadIgnoringCache();
        await waitRendered(t.wc);
        return text(await status(t));
      }),
    tool("browser_reload", "Reload a mockup after editing its file, wait for uu5 to render, and report render status and console error count. Call this after every edit.",
      { file: fileParam },
      async ({ file }) => {
        const t = await resolve(file, { wait: true });
        t.buf.length = 0;
        t.wc.reloadIgnoringCache();
        await waitRendered(t.wc);
        return text(await status(t));
      }),
    tool("browser_console", "Return console messages of a mockup page since its last (re)load. Use after browser_reload/browser_open to find errors.",
      { file: fileParam, onlyErrors: z.boolean().optional().describe("Only errors (default true)") },
      async ({ file, onlyErrors = true }) => {
        const { buf } = await resolve(file);
        const rows = buf.filter((m) => !onlyErrors || m.level === "error");
        return text(rows.length ? rows.map((m) => `[${m.level}] ${m.text}`).join("\n---\n") : "No console messages.");
      }),
    tool("browser_snapshot", "Text snapshot of a rendered mockup: visible text plus interactive elements (buttons, inputs, links, selects). Use to verify content and form fields.",
      { file: fileParam },
      async ({ file }) => {
        const { wc, name } = await resolve(file);
        return text(await snapshotText(wc, name));
      }),
    tool("browser_click", "Click an element of a rendered mockup with real mouse input (a button, tab, link, menu item, checkbox ...) found by its visible text or by a CSS selector, then return the new visible state. Use it to open what is not visible at first (a dialog, a form, a tab, a menu) and check it with browser_screenshot. Nothing is saved: browser_reload resets the page, so clicking never changes the project files. Do not click destructive buttons just to see what happens.",
      { file: fileParam, text: z.string().optional().describe("Visible text, label or tooltip of the element (case-insensitive; an exact match wins over a partial one)"), selector: z.string().optional().describe("CSS selector instead of text"), index: z.number().int().min(0).optional().describe("Which match to click when there are several (0 = the first)") },
      async ({ file, text: label, selector, index = 0 }) => {
        if (!label && !selector) return text("Pass `text` (the visible text of the element) or `selector`.");
        const { wc, name } = await resolve(file);
        const r = await clickIn(wc, { text: label, selector, index });
        if (!r.ok) return text(`Nothing to click for ${label ? `text "${label}"` : `selector "${selector}"`}${r.count ? ` with index ${index} (${r.count} match${r.count > 1 ? "es" : ""})` : ""}. Clickable elements on the page:\n${r.items.join("\n")}`);
        await sleep(700); // the page reacts (a dialog opens, a tab switches)
        return text(`clicked: ${r.tag} "${r.label}"${r.count > 1 ? ` (match ${index + 1} of ${r.count})` : ""}${r.viaFallback ? " (through el.click())" : ""}\n\n${await snapshotText(wc, name)}`);
      }),
    tool("browser_screenshot", "Screenshot (PNG) of a mockup as shown in the app, at the frame's current device size. Use for the final visual check.",
      { file: fileParam },
      async ({ file }) => {
        const { wc } = await resolve(file);
        const img = await captureWithFallback(wc, { nativeImage });
        if (!img) return text("A screenshot is not available right now (the preview is not being painted). Do not wait for it: use browser_snapshot (visible text and interactive elements) and browser_console to check the result.");
        const { width } = img.getSize();
        const png = (width > 1200 ? img.resize({ width: 1200 }) : img).toPNG();
        return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }] };
      }),
  ];

  const viewOf = (file) => { const id = views.get(norm(file)); const wc = id ? webContents.fromId(id) : undefined; return wc && !wc.isDestroyed() ? wc : undefined; };
  return { server: createSdkMcpServer({ name: "studio-browser", version: "0.3.0", tools }), register, unregister, viewOf, baseUrl };
}
