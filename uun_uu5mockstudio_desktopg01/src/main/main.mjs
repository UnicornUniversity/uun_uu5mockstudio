import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeImage, nativeTheme, net, safeStorage, session, shell, ShareMenu } from "electron";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startMockServer } from "./mockServer.mjs";
import { previewPage, previewable, PREVIEW_PREFIX } from "./componentPreview.mjs";
import { createPreviewCheck } from "./previewCheck.mjs";
import { ClaudeService } from "./claudeService.mjs";
import { CodexService, resetCodexPlugins } from "./codexService.mjs";
import { codexStatus, codexVersion, findCodex } from "./codexEnv.mjs";
import { ensureCodexPlugins, codexPluginVersions, codexPluginStates } from "./codexPlugins.mjs";
import { listAgents } from "./agents.mjs";
import { createStudioBrowser } from "./studioBrowserMcp.mjs";
import { createKeyStore, createImageGenerator, DEFAULT_MODEL, MODEL_RE } from "./imageGen.mjs";
import { startBrowserMcpHttp } from "./studioBrowserHttp.mjs";
import { createScreenHistory } from "./screenHistory.mjs";
import { getStatus, login, cancelLogin, installClaude, cancelInstall, installerCommand, installPlugins, checkPluginUpdates, updatePlugins, configure as configureClaude } from "./claudeEnv.mjs";
import { shouldCheck } from "./pluginUpdates.mjs";
import { createCdnCache } from "./cdnCache.mjs";
import { wrapPage, ENVIRONMENTS } from "./environments.mjs";
import { PICKER, EXTRACT, SLOT_MESSAGE, SAVE_MESSAGE } from "./frameCapture.mjs";
import { loadFrame, listFrames, saveFrame, updateFrame, readFrame, parseFrameEnv, frameEnv, SCOPES } from "./frames.mjs";
import { WARMUP_GROUPS, warmupPage } from "./warmup.mjs";
import { exportHtml, exportZip } from "./exporter.mjs";
import { gatherHandoff, buildHandoff } from "./handoff.mjs";
import { findFlowEdges } from "./flow.mjs";
import { SITEMAP_FILE, readSitemap, writeSitemap, restoreSitemap } from "./sitemapFile.mjs";
import { PLANS_DIR, listPlans, readPlan, writePlan, savePlan, removePlan, withStatus, STATUSES } from "./plans.mjs";
import { readComments, changeComments, screensWithComments, defaultAuthor } from "./comments.mjs";
import { findAssets, writeUu5Assets } from "./assets.mjs";
import { resolveProjectsRoot } from "./paths.mjs";
import { createThumbs } from "./thumbs.mjs";
import { loadSource, loadPlugins, mergeSources, readTemplate, applyTemplate, LEVELS, LEVEL_LABELS, KINDS as TEMPLATE_KINDS, slugify, guessLevel, buildInstructions, saveTemplate, removeTemplate, readMine, mineDir } from "./templates.mjs";
import { zipSync } from "fflate";
import { captureWithFallback } from "./screenshot.mjs";
import { createProjects, readState, updateState, writeState } from "./projects.mjs";
import * as chats from "./chats.mjs";
import { saveAttachments, saveAssets } from "./attachments.mjs";
import { GUIDE_TEMPLATE, GUIDE_FILE, readGuide, writeGuide, saveSources, listSources, removeSource, brandCss, injectBrand, distillPrompt, checkScreen, fixPrompt, parseTokens, importManual, sourceDir, sourceKind } from "./brand.mjs";
import { createDocFetcher, adoptStaging, STAGING } from "./docFetcher.mjs";
import { listSitemapUrls } from "./webImages.mjs";
import { sessionFetch } from "./sessionFetch.mjs";
import { readTerritory, writeTerritory, presetsFor, customValues, parseAichatUrl, parseDocUrl, parseLink, snapshotName, KINDS } from "./docSources.mjs";
import { setupUpdater } from "./updater.mjs";
import { loadBml } from "./uuBml.mjs";
import { checkGithub, isRepoUrl, DEFAULT_REPO } from "./githubUpdates.mjs";
import { compareVersions } from "./prerequisites.mjs";
import { bundlePath, canSelfUpdate, downloadTo, digestHex, unpackAndCheck, startSwap } from "./selfUpdate.mjs";
import { captureScreen, formatFromPath, IMAGE_FORMATS } from "./capture.mjs";
import { buildEml, mailBody } from "./mailDraft.mjs";
import { buildMenuTemplate } from "./menu.mjs";
import { tagHtml, structureOf, structureOutline, moveElements, insertElement, removeElements, duplicateElements, editText, changeItems, describeElement, describeItem, elementNames, setProp, removeProp, setItemProp, removeItemProp, setBranch, setItemBranch, describeList, addItem, removeItem, moveItem, duplicateItem, replaceItem, setText } from "./jsxSource.mjs";
import { createDocs, describeComponents } from "./uu5Docs.mjs";
import { isRole } from "../renderer/role.js";
import { snippetFor, CORE_IMPORTS } from "./componentSnippets.mjs";
import { loadIcons } from "./uuGdsIcons.mjs";
import { loadMdi } from "./mdiIcons.mjs";
import { validateRepo, listRepoFiles, listBranches, snapshotBranch } from "./repo.mjs";
import { keepVariantFiles } from "./variantKeep.mjs";
import { RULES_FILE, GLOBAL_FILE, readGlobalRules, writeGlobalRules, appendGlobalRule, readRules, writeRules, readProject, writeProject, migrateDescriptions, appendRule, summarizeChange, readNotes, writeNotes, newNoteId, notePath, screensWithNotes, screenMemoryInfo, forgetScreen } from "./rules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
// App-wide settings (not tied to a project): last opened project, offline CDN mode, projects folder
const appStateFile = path.join(app.getPath("userData"), "app-state.json");
const loadApp = () => { try { return JSON.parse(fs.readFileSync(appStateFile, "utf8")); } catch { return {}; } };
const saveApp = (patch) => { fs.mkdirSync(path.dirname(appStateFile), { recursive: true }); fs.writeFileSync(appStateFile, JSON.stringify({ ...loadApp(), ...patch })); };

const { root, legacyDir } = resolveProjectsRoot({ isPackaged: app.isPackaged, documents: app.getPath("documents"), repoRoot: path.resolve(here, "../.."), env: process.env, saved: loadApp().projectsRoot });
const rootLocked = Boolean(process.env.STUDIO_PROJECTS_DIR || process.env.STUDIO_PROJECT_DIR);

const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { return { error: e.message }; } };

// App icon (derived from the uuGDS "uugds-uu5" glyph). Packaged builds get theirs from electron-builder; a dev run needs it set.
const iconPath = path.resolve(here, "../../build/icon.png");
const devIcon = !app.isPackaged && fs.existsSync(iconPath) ? iconPath : undefined;

app.whenReady().then(async () => {
  if (devIcon && process.platform === "darwin") app.dock?.setIcon(devIcon);
  const projects = createProjects(root, { trash: (p) => shell.trashItem(p) });
  await projects.migrateLegacy(legacyDir);
  await projects.flattenAll();
  // the app starts on the dashboard (no project open): the user writes a prompt there or picks a project
  let current = null;
  const dir = () => { if (!current) throw new Error("No project is open."); return projects.dirOf(current); };
  const listScreens = () => fs.readdirSync(dir()).filter((f) => f.endsWith(".html"));

  // custom frames (frames.mjs): per project in <project>/.studio/frames, global in <userData>/frames
  const frameBase = (scope, project) => (scope === "global" ? path.join(app.getPath("userData"), "frames") : project && !project.startsWith(".") ? path.join(root, project, ".studio", "frames") : null);
  // the brand variables of a project's guide (DESIGN_GUIDE.md) go into every served screen; read again only when the file changed
  const brandCache = new Map();
  const brandCssOf = (project) => {
    if (!project || project.startsWith(".")) return "";
    try {
      const file = path.join(root, project, GUIDE_FILE), mt = fs.statSync(file).mtimeMs, hit = brandCache.get(file);
      if (hit?.mt === mt) return hit.css;
      const css = brandCss(fs.readFileSync(file, "utf8")); brandCache.set(file, { mt, css }); return css;
    } catch { return ""; }
  };
  const routes = Object.fromEntries(WARMUP_GROUPS.map((g, i) => [`/__warmup/${i}.html`, warmupPage(g)]));
  const { port } = await startMockServer(root, { routes, transformHtml: (html, q, rel) => wrapPage(injectBrand(tagHtml(html), brandCssOf(String(rel ?? "").split("/")[1])), q?.get("env"), (env) => loadFrame((scope) => frameBase(scope, String(rel ?? "").split("/")[1]), env)), dynamic: (rel) => (rel.startsWith(PREVIEW_PREFIX) && rel.endsWith(".html") ? previewPage(rel.slice(PREVIEW_PREFIX.length, -5), docs) : null) }); // serves every project: /<project>/<screen>.html

  // Record/replay cache for the plus4u CDN: mockups keep rendering offline once their libraries have been loaded.
  let offline = Boolean(loadApp().offline), warming = false;
  const cdn = createCdnCache({
    dir: path.join(app.getPath("userData"), "cdn-cache"),
    fetchUpstream: (req) => net.fetch(req, { bypassCustomProtocolHandlers: true }),
    offline: () => offline && !warming,
  });
  session.defaultSession.protocol.handle("https", (req) => cdn.handle(req));

  const win = new BrowserWindow({
    width: 1500, height: 940, title: "uu5Mock Studio",
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 22 }, // the lights are centred in the 58 px header rows (chat, dashboard)
    ...(devIcon && process.platform !== "darwin" ? { icon: devIcon } : {}),
    // no throttling: the agent verifies previews while the app is in the background
    webPreferences: { preload: path.join(here, "preload.cjs"), webviewTag: true, backgroundThrottling: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; }); // links go to the system browser, never into a new app window
  const emit = (channel, payload) => !win.isDestroyed() && win.webContents.send(channel, payload);
  // Application menu. Custom items just tell the renderer what to do; it owns the dialogs and the UI state.
  // Glass Effect (macOS): translucent blurred panels. The choice is kept in the app state; macOS 'Reduce transparency' switches the effect off.
  let glass = process.platform === "darwin" && Boolean(loadApp().glass);
  const glassOn = () => glass && !nativeTheme.prefersReducedTransparency;
  function toggleGlass() { glass = !glass; saveApp({ glass }); projects.list().then(rebuildMenu); emit("glass:set", glassOn()); return glassOn(); }
  let usableAgents = null; // ids of the AI providers the user can use (claude, codex), once known: the menu shows only what applies
  let repoLinked = false; // does the open project have a linked repository? (enables the Git items of the Project menu)
  function rebuildMenu(list) {
    const appMenu = Menu.buildFromTemplate(buildMenuTemplate({
      platform: process.platform, appName: "uu5Mock Studio", projects: list, current, repoLinked, glass, offline, isDev: !app.isPackaged, agents: usableAgents,
      send: (action) => {
        if (action === "project:reveal" && current) shell.openPath(dir());
        else if (action === "folder:projects-open") projectsFolder("open");
        else if (action === "folder:projects-change") projectsFolder("change");
        else if (action === "view:glass") toggleGlass();
        else emit("menu:action", action);
      },
    }));
    // a menu-bar menu opening must close the renderer's own dropdowns (project menu…), the web page gets no event for it
    // (on macOS the event of a menu-bar menu fires on the root menu, not on the submenu that opens, so listen on both)
    for (const m of [appMenu, ...appMenu.items.map((it) => it.submenu)]) m?.on("menu-will-show", () => emit("menu:opened"));
    Menu.setApplicationMenu(appMenu);
  }
  /** The folder that holds all projects: open it in the file manager, or pick another one (applied by restarting the app). */
  async function projectsFolder(op) {
    if (op === "path") return { path: root, locked: rootLocked };
    if (op === "open") { const err = await shell.openPath(root); return err ? { error: err } : { path: root }; }
    if (rootLocked) return { error: "The projects folder is fixed by the STUDIO_PROJECTS_DIR environment variable." };
    if (op === "reset") { saveApp({ projectsRoot: null, lastProject: undefined }); app.relaunch(); app.exit(0); return { ok: true }; }
    const r = await dialog.showOpenDialog(win, { title: "Choose the folder that contains your projects", defaultPath: root, properties: ["openDirectory", "createDirectory"], buttonLabel: "Use this folder" });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const picked = path.resolve(r.filePaths[0]);
    if (picked === path.resolve(root)) return { canceled: true };
    saveApp({ projectsRoot: picked, lastProject: undefined }); // the previous project name means nothing in another folder
    app.relaunch(); app.exit(0);
    return { path: picked };
  }
  // ----- component inspector: read / edit the props of a JSX element in the screen's HTML file
  const docs = createDocs();
  // the previews of the catalogue: each page is tried once in a hidden window; only those that render are offered
  const previewCheck = createPreviewCheck({ docs, file: path.join(app.getPath("userData"), "preview-check.json"), probe: async (name) => {
    const w = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { backgroundThrottling: false } });
    try {
      await w.loadURL(`http://127.0.0.1:${port}${PREVIEW_PREFIX}${encodeURIComponent(name)}.html`);
      for (let t = 0; t < 30; t++) { // the libraries come from the CDN: up to 15 s
        await new Promise((r) => setTimeout(r, 500));
        const r = await w.webContents.executeJavaScript(`(() => { const u = document.getElementById("uu5"); return { note: !!(u && u.querySelector("[data-pv-note]")), err: !!window.__pvErr, size: u && u.firstElementChild ? u.getBoundingClientRect().height : 0, text: u ? u.innerText.trim().length : 0 }; })()`);
        if (r.note || r.err) return "fail";
        if (r.size > 24 && r.text > 0) return "ok";
      }
      return "fail";
    } catch { return "fail"; } finally { w.destroy(); }
  } });
  const screenPath = (file) => { const f = path.basename(String(file)); if (!f.endsWith(".html")) throw new Error("Not a screen."); return path.join(dir(), f); };
  /** `sub` = {prop, index, count, name}: an object item of an array prop (e.g. one button of ActionGroup.itemList) instead of the JSX element itself. */
  const inspectInfo = (html, ordinals, sub) => {
    const element = sub ? describeItem(html, ordinals[0], sub.prop, sub.index, sub.count) : describeElement(html, ordinals[0]);
    if (!element) throw new Error("The component no longer exists in the file (the screen changed). Pick it again.");
    if (sub) element.name = sub.name || "item";
    return { element, chain: elementNames(html, ordinals), doc: docs.get(element.name), docsAvailable: docs.available() };
  };
  // library components of the plugin documentation (Uu5Elements, Uu5Forms, Plus4U5Elements, …): found and picked in the chat
  ipcMain.handle("docs:search", (_e, query, library) => ({ available: docs.available(), results: docs.search(query, { library: String(library ?? ""), limit: 60 }) }));
  ipcMain.handle("docs:libraries", () => { previewCheck.run(); return { available: docs.available(), libraries: docs.libraries() }; });
  ipcMain.handle("docs:detail", (_e, name) => { const doc = typeof name === "string" ? docs.get(name) : null; return doc ? { name, library: docs.list().find((c) => c.name === name)?.library ?? "", file: docs.file(name), preview: previewable(name, docs) && previewCheck.status(name) !== "fail", ...doc } : null; });
  // the documentation page of a component opens in the browser; only pages of the uuApp portal (where the wiki links lead) are ever opened
  ipcMain.handle("docs:open", (_e, url) => (typeof url === "string" && /^https:\/\/uuapp\.plus4u\.net\//.test(url) ? shell.openExternal(url).then(() => ({ ok: true })) : { error: "Only documentation pages on uuapp.plus4u.net can be opened." }));
  ipcMain.handle("docs:describe", (_e, names) => ({ names: (Array.isArray(names) ? names : []).filter((n) => typeof n === "string" && docs.has(n)), text: describeComponents(docs, (Array.isArray(names) ? names : []).filter((n) => typeof n === "string")) }));
  // every change the app makes to a screen file is a step that can be undone and redone (not the changes of the agent)
  const history = createScreenHistory();
  const save = (p, before, after, label) => { fs.writeFileSync(p, after); history.record(p, before, after, label); };
  ipcMain.handle("screen:undo", guard((_e, file) => stepHistory(file, "undo")));
  ipcMain.handle("screen:redo", guard((_e, file) => stepHistory(file, "redo")));
  ipcMain.handle("screen:history", guard((_e, file) => history.state(screenPath(file))));
  // `file` = the screen the user works with; when it has no step the last step in the project is taken (undo works without the inspector)
  const stepHistory = (file, way) => {
    const key = way === "undo" ? "undo" : "redo", mine = file ? screenPath(file) : null;
    const p = mine && history.state(mine)[key] ? mine : history.latest(key, (k) => path.dirname(k) === dir()) ?? mine;
    if (!p) return { error: `Nothing to ${way}.` };
    const r = history[way](p, fs.readFileSync(p, "utf8"));
    if (r.error) return { error: r.error };
    fs.writeFileSync(p, r.html); return { ok: true, label: r.label, file: path.basename(p), ...history.state(p) };
  };
  ipcMain.handle("jsx:setBranch", guard((_e, { file, ordinals, name, idx, type, value, sub }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8");
    const out = sub ? setItemBranch(html, ordinals[0], sub.prop, sub.index, name, idx, { type, value }, sub.count) : setBranch(html, ordinals[0], name, idx, { type, value });
    if (out !== html) save(p, html, out, "Change of a value");
    return inspectInfo(out, ordinals, sub);
  }));
  let iconCatalog;
  let bml;
  ipcMain.handle("icons:bml", async () => (bml ??= await loadBml({
    fetchText: async (url) => { const r = await net.fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); },
    cacheFile: path.join(app.getPath("userData"), "uubml.json"),
  })));
  let mdi;
  ipcMain.handle("icons:mdi", async () => (mdi ??= await loadMdi({
    fetchText: async (url) => { const r = await net.fetch(url, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); },
    cacheFile: path.join(app.getPath("userData"), "mdi-icons.json"),
  })));
  ipcMain.handle("icons:catalog", () => (iconCatalog === undefined ? (iconCatalog = loadIcons()) : iconCatalog));
  ipcMain.handle("jsx:inspect", guard((_e, { file, ordinals, sub }) => inspectInfo(fs.readFileSync(screenPath(file), "utf8"), ordinals, sub)));
  const editJsx = (change) => guard((_e, { file, ordinals, name, type, value, sub }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8");
    const out = change(html, ordinals[0], name, { type, value }, sub);
    if (out !== html) save(p, html, out, `Change of ${name}`);
    return inspectInfo(out, ordinals, sub);
  });
  // the items of a list prop (an action list): shown, added, removed, moved, duplicated
  ipcMain.handle("jsx:structure", guard((_e, { file, ordinal }) => structureOf(fs.readFileSync(screenPath(file), "utf8"), String(file).replace(/\.html$/, ""), { ordinal: Number.isInteger(ordinal) ? ordinal : null })));
  // the rearranged structure of a screen: the moves that can safely be done in the file are done, the others are reported
  ipcMain.handle("jsx:moves", guard((_e, { file, ops }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8");
    const r = moveElements(html, Array.isArray(ops) ? ops : []);
    if (r.applied.length && r.html !== html) save(p, html, r.html, "Rearranged components");
    return { applied: r.applied, failed: r.failed, moved: r.moved, structure: structureOf(r.html, String(file).replace(/\.html$/, "")) };
  }));
  // a new component put into the screen (dropped from the catalogue): `target` = the ordinal of the element it goes next to / into. The JSX comes from
  // componentSnippets.mjs (`snippet` only when the caller has its own). What cannot be done in the file is answered with `needsAgent` and a reason:
  // there is no JSX for the component, the place does not allow it, or it needs a library the page does not import (it would not render at all).
  ipcMain.handle("jsx:insert", guard((_e, { file, target, position, snippet, name }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8");
    const built = snippet ? { snippet, source: "given" } : snippetFor(String(name), docs);
    if (!built) return { needsAgent: true, reason: `there is no ready-made code for ${name}` };
    const r = insertElement(html, { target, position, snippet: built.snippet, name, imports: CORE_IMPORTS });
    if (r.error) return { needsAgent: true, reason: r.error };
    if (r.missingImport) return { needsAgent: true, reason: `${r.missingImport} is not imported in this screen` };
    save(p, html, r.html, `Added ${name ?? "a component"}`);
    return { ordinal: r.ordinal, source: built.source, ...(r.addedImport ? { addedImport: r.addedImport } : {}), structure: structureOf(r.html, String(file).replace(/\.html$/, "")) };
  }));
  // components taken out of a screen (Delete in the inspector, the button of the panel): the ones the file lets go are removed, the others are reported
  ipcMain.handle("jsx:delete", guard((_e, { file, ordinals }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8");
    const r = removeElements(html, Array.isArray(ordinals) ? ordinals : []);
    if (r.applied.length && r.html !== html) save(p, html, r.html, r.applied.length === 1 ? "Removed a component" : "Removed components");
    return { applied: r.applied, failed: r.failed };
  }));
  // copies of components, each right after its original
  ipcMain.handle("jsx:duplicate", guard((_e, { file, ordinals }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8");
    const r = duplicateElements(html, Array.isArray(ordinals) ? ordinals : []);
    if (r.copies.length && r.html !== html) save(p, html, r.html, r.copies.length === 1 ? "Duplicated a component" : "Duplicated components");
    return { copies: r.copies, failed: r.failed };
  }));
  // the text of a component changed on the screen (double click in the Edit mode): found in the file by what it said
  ipcMain.handle("jsx:editText", guard((_e, { file, ordinal, old, value }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8"), out = editText(html, ordinal, String(old ?? ""), String(value ?? ""));
    if (out !== html) save(p, html, out, "Change of a text");
    return { ok: true };
  }));
  // several items of a list prop at once (one undo step): remove / duplicate the items `indexes`, or add one (`props`, at the place `at`)
  ipcMain.handle("jsx:items", guard((_e, { file, ordinal, prop, op, indexes, props, at }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8");
    const { html: out, ...result } = changeItems(html, ordinal, String(prop), op, { indexes: Array.isArray(indexes) ? indexes : [], props: Array.isArray(props) ? props : [], at });
    if (out !== html) save(p, html, out, op === "remove" ? "Removed items" : op === "duplicate" ? "Duplicated items" : "Added an item");
    return result;
  }));
  ipcMain.handle("jsx:list", guard((_e, { file, ordinals, prop }) => describeList(fs.readFileSync(screenPath(file), "utf8"), ordinals[0], String(prop))));
  ipcMain.handle("jsx:item", guard((_e, { file, ordinals, prop, op }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8"), o = ordinals[0];
    const out = op.type === "add" ? addItem(html, o, prop, op.props, op.at) : op.type === "remove" ? removeItem(html, o, prop, op.index)
      : op.type === "move" ? moveItem(html, o, prop, op.from, op.to) : op.type === "duplicate" ? duplicateItem(html, o, prop, op.index) : op.type === "replace" ? replaceItem(html, o, prop, op.index, op.text) : null;
    if (out == null) throw new Error("Unknown operation.");
    if (out !== html) save(p, html, out, "Change of a list");
    return describeList(out, o, prop);
  }));
  // the text of one language of a text / LSI, edited where it is written
  ipcMain.handle("jsx:setText", guard((_e, { file, ordinals, scope, lang, value }) => {
    const p = screenPath(file), html = fs.readFileSync(p, "utf8"), out = setText(html, ordinals[0], scope, lang, value);
    if (out !== html) save(p, html, out, "Change of a text");
    return { ok: true };
  }));
  ipcMain.handle("jsx:set", editJsx((html, o, name, v, sub) => (sub ? setItemProp(html, o, sub.prop, sub.index, name, v, sub.count) : setProp(html, o, name, v))));
  ipcMain.handle("jsx:remove", editJsx((html, o, name, _v, sub) => (sub ? removeItemProp(html, o, sub.prop, sub.index, name, sub.count) : removeProp(html, o, name))));
  ipcMain.handle("projects:folder", guard((_e, op) => projectsFolder(String(op))));
  if (process.env.STUDIO_TEST) globalThis.__studioTest = { Menu, win }; // lets automated checks inspect/click the menu through --inspect

  // Picture generation (OpenAI): off until the user turns it on and enters a key; the key is kept encrypted by the OS, outside app-state.json
  const imageKeys = createKeyStore({ file: path.join(app.getPath("userData"), "openai-key.bin"), safeStorage });
  const imageModel = () => loadApp().imageModel || process.env.STUDIO_IMAGE_MODEL || DEFAULT_MODEL; // Settings, then the environment, then the default
  const imageGen = createImageGenerator({ keyStore: imageKeys, isEnabled: async () => Boolean(loadApp().imageGen), getModel: async () => imageModel() });
  const imageGenStatus = async () => ({ enabled: Boolean(loadApp().imageGen), model: loadApp().imageModel || "", effectiveModel: imageModel(), defaultModel: DEFAULT_MODEL, ...(await imageKeys.status()) });
  ipcMain.handle("imagegen:status", guard(imageGenStatus));
  ipcMain.handle("settings:agents", () => usableAgents); // which AI providers the Settings window lists (null = not known yet)
  ipcMain.handle("imagegen:save", guard(async (_e, { enabled, key, model }) => {
    const m = String(model ?? "").trim();
    if (m && !MODEL_RE.test(m)) throw new Error("This does not look like the name of a model (letters, digits, . _ : -).");
    if (typeof key === "string" && key.trim()) await imageKeys.set(key); // refuses a junk key and storing without encryption
    saveApp({ imageGen: Boolean(enabled), imageModel: m });
    return imageGenStatus();
  }));
  ipcMain.handle("imagegen:clearKey", guard(async () => { await imageKeys.clear(); return imageGenStatus(); }));

  const browser = createStudioBrowser({
    generateImage: (dir, args) => imageGen.generate(dir, args),
    baseUrl: `http://127.0.0.1:${port}`,
    onNavigated: (screen) => emit("preview:navigated", screen),
    projectDir: () => dir(),
    readImages: (url) => readWebImages(url), // the page as the app opens it: pictures a script draws, and those only a signed-in user sees
    fetchWithAccess: sessionFetch(() => session.fromPartition(PREVIEW_PARTITION)),
    readStructure: (file) => { const f = path.basename(String(file)); const t = structureOf(fs.readFileSync(screenPath(f), "utf8"), f.replace(/\.html$/, "")); return t ? structureOutline(t) : null; },
  });

  // The same preview tools over HTTP for Codex (Claude gets them in-process). Started on first use; without it Codex just works without the preview tools.
  let browserHttp;
  const browserMcpUrl = () => (browserHttp ??= startBrowserMcpHttp(browser.tools).catch(() => null)).then((h) => h?.url ?? "");

  // ----- per-project runtime: Claude session and file watcher follow the open project
  let claude, codex, watcher, watchTimer; // the two AI providers of the open project (claude, codex); each continues its own session of a conversation
  let currentChatId = null; // the open conversation of the open project
  const loadChats = (projectDir) => updateState(projectDir, (st) => chats.normalize(st)); // persists the normalized shape so ids stay stable
  // The folder the agent reads the linked repository from: the repository itself, or a read-only snapshot of the branch picked in the app.
  const VIEWS_DIR = path.join(app.getPath("userData"), "repo-views");
  const repoReadDir = async (st) => {
    const r = st?.repo; if (!r?.path || !fs.existsSync(r.path)) return null;
    if (!r.view) return r.path;
    if (r.viewDir && fs.existsSync(r.viewDir)) return r.viewDir;
    return snapshotBranch({ repoDir: r.path, branch: r.view, baseDir: VIEWS_DIR }).catch(() => r.path); // the branch is gone: fall back to the checkout
  };
  /** The events of one provider to the window: only while its project and conversation are still the open ones; the session id it reports is kept with the conversation. */
  const eventSink = (getSvc, provider, name, projectDir) => (m) => {
    const svc = getSvc();
    if (name !== current) return; // late events of a project that is no longer open
    if (svc.runChat && svc.runChat !== currentChatId) return; // late events of a conversation that is no longer open
    if (m.sessionId && svc.runChat) updateState(projectDir, (s) => chats.setSession(chats.normalize(s), svc.runChat, m.sessionId, provider)).catch(() => {});
    emit("claude:event", m);
  };
  const newClaude = async () => {
    const name = current, projectDir = dir();
    const st = await loadChats(projectDir);
    currentChatId = st.currentChatId;
    const svc = new ClaudeService({
      repoDir: await repoReadDir(st), repoLabel: st.repo?.view ? `snapshot of branch ${st.repo.view}` : "",
      cwd: projectDir, urlBase: `http://127.0.0.1:${port}/${encodeURIComponent(name)}`, browserMcp: browser.server, globalRoot: root, docs,
      sessionId: chats.current(st).sessionId ?? undefined,
      onEvent: eventSink(() => svc, "claude", name, projectDir),
    });
    return svc;
  };
  const newCodex = async () => {
    const name = current, projectDir = dir();
    const st = await loadChats(projectDir);
    const svc = new CodexService({
      repoDir: await repoReadDir(st), repoLabel: st.repo?.view ? `snapshot of branch ${st.repo.view}` : "",
      cwd: projectDir, urlBase: `http://127.0.0.1:${port}/${encodeURIComponent(name)}`, globalRoot: root, docs, mcpUrl: await browserMcpUrl(),
      sessionId: chats.current(st).codexSessionId ?? undefined,
      onEvent: eventSink(() => svc, "codex", name, projectDir),
    });
    return svc;
  };
  const stopAgents = () => { claude?.stop(); codex?.stop(); };
  const resumeAgents = (st) => { const c = chats.current(st); claude?.setSession(c.sessionId); codex?.setSession(c.codexSessionId); };
  // Project memory: BUSINESS_RULES.md and <screen>.notes.md. `lastRules` is the version the user has already seen, so that a change made
  // by the agent (or by hand outside the app) is reported once with what was added, while our own saves are silent.
  let lastRules = "";
  const startWatch = () => {
    const name = current, changed = new Set();
    let rulesDirty = false, notesDirty = false, projectDirty = false, brandDirty = false, sitemapDirty = false;
    // the plans (<project>/plans/*.md) are in a subfolder, which the non-recursive watch of the project does not see; it may appear later (the first plan)
    let plansWatch = null, plansTimer;
    const watchPlans = () => {
      if (plansWatch) return;
      try { plansWatch = fs.watch(path.join(dir(), PLANS_DIR), () => { clearTimeout(plansTimer); plansTimer = setTimeout(async () => { if (name === current) emit("plans:changed", { project: name, plans: await listPlans(dir()) }); }, 250); }); plansWatch.on("error", () => { plansWatch = null; }); } catch { /* no plans yet */ }
    };
    watchPlans();
    const rootWatch = fs.watch(dir(), (_evt, file) => {
      if (file === SITEMAP_FILE) sitemapDirty = true;
      if (file === PLANS_DIR) { watchPlans(); clearTimeout(plansTimer); plansTimer = setTimeout(async () => { if (name === current) emit("plans:changed", { project: name, plans: await listPlans(dir()) }); }, 250); }
      if (file?.endsWith(".html")) changed.add(file);
      if (file === RULES_FILE) rulesDirty = true;
      if (file === "PROJECT.md") projectDirty = true;
      if (file === GUIDE_FILE) brandDirty = true;
      if (file?.endsWith(".notes.md")) notesDirty = true;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(async () => {
        if (name !== current) return;
        emit("preview:changed", { project: name, screens: listScreens(), changed: [...changed] }); changed.clear();
        if (sitemapDirty) { sitemapDirty = false; emit("sitemap:changed", { project: name, ...((await readSitemap(dir())) ?? { sitemap: null, hasPrev: false }) }); }
        if (rulesDirty) { rulesDirty = false; const now = await readRules(dir()), s = summarizeChange(lastRules, now); lastRules = now; if (s.added.length || s.removed.length) emit("memory:changed", { project: name, kind: "rules", ...s }); }
        if (brandDirty) { brandDirty = false; emit("memory:changed", { project: name, kind: "brand" }); }
        if (projectDirty) { projectDirty = false; emit("memory:changed", { project: name, kind: "project" }); }
        if (notesDirty) { notesDirty = false; emit("memory:changed", { project: name, kind: "notes", screens: screensWithNotes(dir()) }); }
      }, 250);
    });
    watcher = { close: () => { rootWatch.close(); plansWatch?.close(); clearTimeout(plansTimer); } };
  };
  /** The repository linked to the open project as the UI shows it: { path, name, branch } or { path, name, error } when it is gone. */
  const repoView = async (state) => {
    const p = state?.repo?.path; if (!p) return null;
    try { return { ...(await validateRepo(p)), view: state.repo.view ?? null, readDir: (await repoReadDir(state)) ?? p }; } catch (e) { return { path: p, name: path.basename(p), error: e.message }; }
  };
  /** The level the open project was started on ("page" gets the environments); from the template it was made from, else guessed from its screens. */
  const projectEnv = (state) => {
    const kind = state?.kind, scope = kind?.scope === "site" || kind?.scope === "single" ? kind.scope : null; // what the dashboard was told: one page, or the whole web site / portal
    const r = templateEnv();
    return { ...r, level: LEVELS.includes(kind?.level) ? kind.level : r.level, scope };
  };
  const templateEnv = () => {
    try { const t = JSON.parse(fs.readFileSync(path.join(dir(), ".studio", "template", "template.json"), "utf8")); return { level: t.level ?? null, environment: t.environment ?? null }; } catch { /* no template */ }
    try { return { level: guessLevel(listScreens().map((n) => fs.readFileSync(path.join(dir(), n), "utf8"))), environment: null }; } catch { return { level: null, environment: null }; }
  };
  const payload = async () => {
    const list = await projects.list();
    repoLinked = current ? Boolean((await readState(dir()))?.repo?.path) : false;
    rebuildMenu(list); // every change of the open project / project list flows through here
    const base = { port, webviewPreload: pathToFileURL(path.join(here, "webviewPreload.cjs")).href, project: current, projects: list };
    if (!current) { currentChatId = null; return { ...base, screens: [], chat: [], chatId: null, chats: [], layout: null }; }
    const state = await loadChats(dir());
    currentChatId = state.currentChatId;
    return { ...base, screens: listScreens(), chat: chats.current(state).entries, chatId: state.currentChatId, chats: chats.list(state), layout: state.layout, ...projectEnv(state), repo: await repoView(state), notes: screensWithNotes(dir()) };
  };
  /** Close the open project: back to the start screen, nothing runs for it any more. */
  const closeProject = async () => {
    stopAgents(); watcher?.close(); clearTimeout(watchTimer);
    claude = null; codex = null; current = null; currentChatId = null; saveApp({ lastProject: null });
    return payload();
  };
  /** Switch the whole workspace (chat, canvas, Claude session, watcher) to another project. */
  const openProject = async (name) => {
    stopAgents(); watcher?.close(); clearTimeout(watchTimer);
    current = name; saveApp({ lastProject: name });
    fs.mkdirSync(dir(), { recursive: true });
    await migrateDescriptions(dir()).catch(() => {}); claude = await newClaude(); codex = await newCodex(); lastRules = await readRules(dir()); startWatch();
    return payload();
  };
  rebuildMenu(await projects.list());

  ipcMain.handle("app:info", payload);
  ipcMain.handle("projects:list", () => projects.list());
  // the picture of a project for the dashboard: its newest screen painted in a hidden window (kept in .studio/thumb.jpg)
  const thumbs = createThumbs({ projects, port, render: async (html, count) => {
    // the page is served by the preview server itself (a route made for this one picture), so that its frames are same-origin and can be looked into
    const route = `/__thumb/${Date.now()}-${Math.random().toString(36).slice(2)}.html`;
    routes[route] = html;
    const w = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { backgroundThrottling: false } });
    try {
      await w.loadURL(`http://127.0.0.1:${port}${route}`);
      const lengths = () => w.webContents.executeJavaScript(`[...document.querySelectorAll("iframe")].map((f) => { try { return (f.contentDocument.body.innerText || "").trim().length; } catch { return -1; } })`).catch(() => []);
      let ready = 0, last = [];
      for (let t = 0; t < 60 && ready < 2; t++) { // the libraries come from the CDN (slow on a cold cache): wait until every screen shows text, twice in a row
        await new Promise((r) => setTimeout(r, 500));
        last = await lengths();
        ready = last.length === count && last.every((n) => n >= 20) ? ready + 1 : 0;
      }
      await new Promise((r) => setTimeout(r, 500));
      const img = await captureWithFallback(w.webContents, { nativeImage });
      if (!img) return null;
      const buf = img.resize({ width: 640, quality: "good" }).toJPEG(82);
      return last.some((n) => n >= 20) ? buf : { buf, cache: false }; // nothing rendered at all: show it, but try again next time
    } catch { return null; } finally { w.destroy(); delete routes[route]; }
  } });
  // ----- templates for new projects: built-in < plugins (a plugin may bring a templates/ folder) < mine
  const tplBuiltin = path.join(here, "templates", "builtin"), tplMine = path.join(app.getPath("userData"), "templates", "mine");
  const publicTemplate = ({ dir, ...t }) => t;
  let all = [];
  async function templateList() {
    const builtin = await loadSource(tplBuiltin, "builtin"), plugins = await loadPlugins(), mine = await loadSource(tplMine, "mine");
    all = mergeSources([builtin.templates, plugins.templates, mine.templates]);
    const count = (source) => all.filter((t) => t.source === source || (source === "plugins" && t.source.startsWith("plugin:"))).length;
    return {
      templates: all.map(publicTemplate), levels: LEVEL_LABELS,
      sources: [
        { id: "builtin", label: "Built-in", count: count("builtin"), errors: builtin.errors },
        { id: "plugins", label: "Plugins", count: count("plugins"), errors: plugins.errors },
        { id: "mine", label: "My templates", count: count("mine"), errors: mine.errors, path: tplMine },
      ],
    };
  }
  ipcMain.handle("screen:title", guard((_e, file) => { // the <title> of a screen of the open project
    const f = path.basename(String(file));
    return /<title>([^<]*)<\/title>/i.exec(fs.readFileSync(path.join(dir(), f), "utf8"))?.[1]?.trim() ?? null;
  }));
  ipcMain.handle("templates:list", guard(() => templateList()));
  ipcMain.handle("templates:reveal", guard(async () => { fs.mkdirSync(tplMine, { recursive: true }); const err = await shell.openPath(tplMine); return err ? { error: err } : { path: tplMine }; }));
  // the starter files of a template go into the open project (called right after the project was made)
  ipcMain.handle("templates:apply", guard(async (_e, id) => {
    if (!all.length) await templateList();
    const t = all.find((x) => x.id === id); if (!t) throw new Error("That template is not available any more.");
    const r = await applyTemplate(await readTemplate(t), dir());
    return { ...r, screens: listScreens(), level: t.level, environment: t.environment ?? null };
  }));
  // ----- my templates made from screens of the open project (Screen → Save as Template…, the Templates dialog)
  const chosenScreens = (files) => [...new Set([].concat(files ?? []).map((f) => path.basename(String(f))))].filter((f) => f.endsWith(".html") && fs.existsSync(path.join(dir(), f)));
  const mineIds = () => new Set(fs.existsSync(tplMine) ? fs.readdirSync(tplMine).filter((id) => mineDir(tplMine, id)) : []);
  // what the dialog starts with: a title from the <title> of the first screen, a guessed level, whether the id is taken
  ipcMain.handle("templates:draft", guard(async (_e, files) => {
    const names = chosenScreens(files); if (!names.length) throw new Error("Choose a screen of the project.");
    const htmls = names.map((f) => fs.readFileSync(path.join(dir(), f), "utf8"));
    const title = (/<title>([^<]*)<\/title>/i.exec(htmls[0])?.[1] ?? "").split(/\s+[–—|-]\s+/)[0].trim() || names[0].replace(/\.html$/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
    const notes = (await Promise.all(names.map(async (f) => (await readNotes(dir(), f)).length))).reduce((a, b) => a + b, 0);
    const local = [...new Set(htmls.flatMap((h) => [...h.matchAll(/\b(?:src|href)\s*=\s*["']([^"'{}]+)["']/g)].map((m) => m[1].trim())))].filter((u) => u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\$)/i.test(u));
    return { files: names, screens: listScreens(), title, local, id: slugify(title), level: guessLevel(htmls), levels: LEVEL_LABELS, kinds: TEMPLATE_KINDS, taken: [...mineIds()], hasRules: Boolean((await readRules(dir())).replace(/^#.*$/m, "").replace(/Rules, constraints[^\n]*/, "").replace(/##\s*General/, "").trim()), notes };
  }));
  ipcMain.handle("templates:save", guard(async (_e, t) => {
    const names = chosenScreens(t?.files); if (!names.length) throw new Error("Choose at least one screen.");
    const notes = (await Promise.all(names.map(async (f) => (await readNotes(dir(), f)).map((n) => ({ screen: f, text: n.text }))))).flat();
    const createdFrom = `${current} (${names.join(", ")})`;
    const instructions = buildInstructions({ title: String(t.title ?? ""), description: String(t.description ?? ""), instructions: String(t.instructions ?? ""), rules: t.withRules === false ? "" : await readRules(dir()), notes: t.withNotes === false ? [] : notes, createdFrom });
    const r = await saveTemplate(tplMine, { ...t, id: t.id || slugify(t.title), files: names.map((f) => ({ name: f, html: fs.readFileSync(path.join(dir(), f), "utf8") })), instructions, createdFrom }, { overwrite: Boolean(t.overwrite) });
    if (!r.exists) await templateList();
    return { exists: Boolean(r.exists), id: r.id };
  }));
  ipcMain.handle("templates:get", guard((_e, id) => readMine(tplMine, id)));
  // a change of one of my templates (title, level, texts, the whole TEMPLATE.md); its screens stay
  ipcMain.handle("templates:update", guard(async (_e, id, t) => {
    const old = await readMine(tplMine, id), d = mineDir(tplMine, id);
    const files = old.files.map((name) => ({ name, html: fs.readFileSync(path.join(d, name), "utf8") }));
    const newId = t.id && t.id !== id ? String(t.id) : id;
    if (newId !== id && mineIds().has(newId)) throw new Error(`A template with the id ${newId} exists already.`);
    await saveTemplate(tplMine, { ...old, ...t, id: newId, files, instructions: t.markdown ?? old.markdown, createdFrom: old.createdFrom }, { overwrite: true });
    if (newId !== id) await removeTemplate(tplMine, id);
    await templateList();
    return { id: newId };
  }));
  ipcMain.handle("templates:remove", guard(async (_e, id) => { const r = await removeTemplate(tplMine, id); await templateList(); return r; }));
  ipcMain.handle("templates:show", guard((_e, id) => { const d = mineDir(tplMine, id); if (!d) throw new Error("That template is not one of yours."); shell.showItemInFolder(path.join(d, "template.json")); return { ok: true }; }));
  // a template as a ZIP (a folder ready for my templates of a colleague or for the templates/ folder of a plugin)
  ipcMain.handle("templates:zip", guard(async (_e, id) => {
    const d = mineDir(tplMine, id); if (!d) throw new Error("That template is not one of yours.");
    const dest = await pickDest(`${id}.zip`, "zip", "ZIP"); if (!dest) return { canceled: true };
    const entries = Object.fromEntries(fs.readdirSync(d).filter((f) => fs.statSync(path.join(d, f)).isFile()).map((f) => [`${id}/${f}`, new Uint8Array(fs.readFileSync(path.join(d, f)))]));
    fs.writeFileSync(dest, zipSync(entries));
    return { path: dest };
  }));
  ipcMain.handle("projects:thumb", guard((_e, name) => thumbs.get(String(name))));
  ipcMain.handle("projects:close", guard(() => closeProject()));
  ipcMain.handle("projects:open", guard((_e, name) => openProject(name)));
  // what a project was started as on the dashboard: the level and, for Web and Document, one page or the whole site (decides where the sitemap is offered)
  ipcMain.handle("project:setKind", guard(async (_e, kind) => {
    if (!current) throw new Error("No project is open.");
    const level = LEVELS.includes(kind?.level) ? kind.level : null, scope = (level === "web" || level === "page") && (kind?.scope === "site" || kind?.scope === "single") ? kind.scope : null;
    await updateState(dir(), (s) => { s.kind = { level, scope }; return s; });
    return { level, scope };
  }));
  ipcMain.handle("projects:create", guard(async (_e, name) => openProject(await projects.create(name))));
  ipcMain.handle("projects:rename", guard(async (_e, from, to) => {
    const wasCurrent = from === current;
    if (!wasCurrent) { await projects.rename(from, to); return payload(); }
    stopAgents(); watcher?.close();
    try { return await openProject(await projects.rename(from, to)); }
    catch (e) { await openProject(from); throw e; }
  }));
  ipcMain.handle("projects:delete", guard(async (_e, name) => {
    if (name !== current) { await projects.remove(name); return payload(); }
    stopAgents(); watcher?.close();
    await projects.remove(name);
    return openProject(await projects.ensure());
  }));

  ipcMain.handle("view:register", (_e, file, id) => browser.register(file, id));
  ipcMain.handle("view:unregister", (_e, file) => browser.unregister(file));
  // Renderer debounces saves, so every write names its project and is dropped when the user has already switched away.
  ipcMain.handle("layout:save", (_e, project, layout) => project === current && writeState(dir(), { layout }));
  // Conversations: each project keeps several; every one has its own Claude session so it can be continued later.
  const chatView = (st) => ({ chatId: st.currentChatId, entries: chats.current(st).entries, chats: chats.list(st) });
  const mutateChats = async (fn) => { const st = await updateState(dir(), (s) => { fn(chats.normalize(s)); return s; }); currentChatId = st.currentChatId; return st; };
  ipcMain.handle("chat:save", (_e, project, chatId, entries) => project === current && updateState(dir(), (s) => chats.saveEntries(chats.normalize(s), chatId, entries)).then(() => true));
  ipcMain.handle("chat:list", guard(async () => chats.list(await loadChats(dir()))));
  ipcMain.handle("chat:new", guard(async () => {
    stopAgents();
    let created = false;
    const st = await mutateChats((s) => { created = chats.newChat(s).created; });
    resumeAgents(st);
    return { created, ...chatView(st) };
  }));
  ipcMain.handle("chat:switch", guard(async (_e, id) => {
    stopAgents();
    const st = await mutateChats((s) => chats.switchChat(s, id));
    resumeAgents(st);
    return chatView(st);
  }));
  ipcMain.handle("chat:delete", guard(async (_e, id) => {
    if (id === currentChatId) stopAgents();
    const st = await mutateChats((s) => chats.deleteChat(s, id));
    resumeAgents(st);
    return chatView(st);
  }));
  ipcMain.handle("attachments:save", guard((_e, items) => saveAttachments(dir(), items)));
  ipcMain.handle("assets:save", guard((_e, items) => saveAssets(dir(), items)));
  // Documents of Plus4U (uuBookKit pages, uuManagementKit ECC documents) pasted into the chat: read once through the MCP proxy, kept as a snapshot in the project
  const docFetcher = createDocFetcher();
  app.on("will-quit", () => { docFetcher.close(); });
  /**
   * A picture of a rendered document (<project>/<rel>, served by the preview server): a hidden window 1280 px wide waits until the uu5
   * libraries have painted the text, then the whole page is captured. { full: JPEG for the agent and the preview, thumb: data URL for the card }.
   */
  // the pictures of documents are made in a session of their own (cookies kept between runs) in which the user can sign in to Plus4U (docs:previewLogin):
  // the data and pictures that need a signed-in user (business cards, files of the document) then load as in the browser. The token of the MCP proxy is not used for it.
  const PREVIEW_PARTITION = "persist:plus4u-preview";
  // Environments of a Page (see environments.mjs): the list, and whether the live Top can be used (a Plus4U sign-in in the preview session)
  ipcMain.handle("env:list", guard(() => ({ environments: [...ENVIRONMENTS, ...listFrames((scope) => frameBase(scope, current))] })));
  ipcMain.handle("frames:save", guard((_e, scope, frame) => { const base = frameBase(scope, current); if (!base) throw new Error("No project is open."); return saveFrame(base, scope, frame ?? {}); }));
  // the draft taken by frames:capture becomes a frame of the open project or a global one
  ipcMain.handle("frames:saveDraft", guard(async (_e, scope, label) => {
    const base = frameBase(scope, current); if (!base) throw new Error("No project is open.");
    const draftDir = path.join(dir(), ".studio", "frames-draft");
    const read = (n) => fs.promises.readFile(path.join(draftDir, n), "utf8");
    let meta; try { meta = JSON.parse(await read("draft.json")); } catch { throw new Error("There is no captured page yet."); }
    const saved = saveFrame(base, scope, { label, url: meta.url, html: await read("frame.html"), css: await read("frame.css").catch(() => ""), offset: meta.offset });
    await fs.promises.cp(path.join(draftDir, "img"), path.join(base, saved.id, "img"), { recursive: true }).catch(() => {}); // the pictures of icons
    return { ...saved, dir: path.join(base, saved.id) };
  }));
  ipcMain.handle("frames:remove", guard(async (_e, env) => { // moved to the trash, so it can be restored
    const p = parseFrameEnv(env); if (!p) throw new Error("Unknown frame.");
    const base = frameBase(p.scope, current), folder = base && path.join(base, p.id);
    if (!folder || !fs.existsSync(folder)) throw new Error("The frame is already gone.");
    await shell.trashItem(folder); return true;
  }));
  // The window shows the real page of the document. A button in it ("Use this page as the picture") takes the picture from what the signed-in user sees: that replaces the picture of the card and the one the agent gets.
  ipcMain.handle("docs:previewLogin", guard((_e, url) => new Promise((resolve) => {
    const doc = parseDocUrl(String(url ?? ""));
    if (!doc || !/^https:\/\/uuapp\.plus4u\.net\//.test(doc.url)) throw new Error("This is not a link to a Plus4U document.");
    const home = docHome();
    const w = new BrowserWindow({ width: 1280, height: 900, title: "Plus4U: sign in, open the page the way it should look, then press “Use this page as the picture”", webPreferences: { partition: PREVIEW_PARTITION } });
    w.setTitle("Plus4U: sign in, open the page as it should look, then press “Use this page as the picture”");
    w.webContents.on("page-title-updated", (e) => e.preventDefault());
    w.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https:\/\//.test(u)) w.loadURL(u); return { action: "deny" }; });
    const BUTTON = `(() => { if (document.getElementById("__uu5mock_cap")) return; const b = document.createElement("button"); b.id = "__uu5mock_cap"; b.textContent = "Use this page as the picture"; b.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:10px 16px;border-radius:10px;border:0;background:#1976d2;color:#fff;font:600 14px system-ui;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer"; b.onclick = () => console.log("__uu5mock_capture__"); document.documentElement.append(b); })()`;
    let busy = false, result = { ok: true }; // busy: the picture is being taken, the button must stay out of it
    const inject = () => (busy || w.isDestroyed() ? undefined : w.webContents.executeJavaScript(BUTTON).catch(() => {}));
    w.webContents.on("dom-ready", inject);
    const timer = setInterval(inject, 1500); // the page rebuilds its content now and then
    w.webContents.on("console-message", async (...a) => {
      const msg = typeof a[0]?.message === "string" ? a[0].message : a[2];
      if (msg !== "__uu5mock_capture__" || busy) return;
      busy = true;
      try {
        await w.webContents.executeJavaScript(`document.getElementById("__uu5mock_cap")?.remove()`).catch(() => {});
        const pic = await pictureOf(w.webContents);
        if (!pic) throw new Error("The picture could not be taken.");
        const dir = path.join(home.dir, ".studio", "sources"), name = snapshotName(doc), shot = path.join(dir, `${name}.jpg`);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(shot, pic.full);
        const metaFile = path.join(dir, `${name}.json`);
        const meta = JSON.parse(await fs.promises.readFile(metaFile, "utf8").catch(() => "null"));
        if (meta) await fs.promises.writeFile(metaFile, JSON.stringify({ ...meta, shot: `${name}.jpg` }, null, 2));
        result = { ok: true, shot, thumb: pic.thumb };
        w.destroy();
      } catch (e) { busy = false; w.isDestroyed() || inject(); dialog.showErrorBox("The picture could not be taken", String(e?.message ?? e)); }
    });
    w.on("closed", () => { clearInterval(timer); resolve(result); });
    w.loadURL(doc.url);
  })));
  // A web site that shows its pages only to a signed-in user: the window opens it in the preview session, the user signs in and closes it; the hidden window
  // that reads the structure of the site (docs:structure) shares that session, so the next reading sees what the user sees.
  ipcMain.handle("docs:webLogin", guard((_e, url) => new Promise((resolve) => {
    const doc = parseLink(String(url ?? ""));
    if (!doc || !/^https:/i.test(doc.url)) throw new Error("Only an https page can be opened to sign in.");
    const w = new BrowserWindow({ width: 1280, height: 900, webPreferences: { partition: PREVIEW_PARTITION } });
    w.setTitle("Sign in so that the page shows what you see, then close this window");
    w.webContents.on("page-title-updated", (e) => e.preventDefault());
    w.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https:\/\//.test(u)) w.loadURL(u); return { action: "deny" }; });
    w.webContents.on("will-navigate", (e, to) => { if (!/^https?:/i.test(to)) e.preventDefault(); });
    w.on("closed", () => resolve({ ok: true }));
    w.loadURL(doc.url).catch(() => {});
  })));
  // Custom frames: the window shows a real page (any https page; the Plus4U sign-in of the preview session is kept); the user chooses the content slot and the rest is taken as a draft frame.
  // The draft goes to <project>/.studio/frames-draft/ (frame.html, frame.css, draft.json, shot.jpg) for Claude to tidy up; frames:save then stores the finished frame.
  const captureFrame = (url, preset = null) => new Promise((resolve) => {
    const u = String(url ?? "").trim();
    if (!/^https:\/\//i.test(u)) throw new Error("Paste a link that starts with https://");
    if (!current) throw new Error("Open a project first.");
    const outDir = path.join(dir(), ".studio", "frames-draft");
    const w = new BrowserWindow({ width: 1440, height: 900, webPreferences: { partition: PREVIEW_PARTITION } });
    w.setTitle("Sign in and open the page, then “Choose content area” and “Save as frame”");
    w.webContents.on("page-title-updated", (e) => e.preventDefault());
    let busy = false, saving = false, result = { ok: false, cancelled: true };
    const presetJs = preset ? `window.__uu5mockPreset = ${JSON.stringify(preset)};` : "";
    const inject = () => (busy || w.isDestroyed() ? undefined : w.webContents.executeJavaScript(presetJs + PICKER).catch(() => {}));
    w.webContents.on("dom-ready", inject);
    const timer = setInterval(inject, 1500);
    w.webContents.on("console-message", async (...a) => {
      const msg = typeof a[0]?.message === "string" ? a[0].message : a[2];
      if (msg !== SAVE_MESSAGE || busy) return;
      busy = true;
      try {
        const draft = await w.webContents.executeJavaScript(EXTRACT);
        if (!draft) throw new Error("Choose the content area first.");
        // one picture of the window (the page is as the user left it), every icon is cut out of it: a capture per icon was slow
        const view = await w.webContents.capturePage();
        const pageUrl = w.webContents.getURL();
        saving = true;
        w.destroy(); // the window is gone at once: the rest is only writing files
        const { width: vw, height: vh } = view.getSize(), scale = vw / (draft.width || vw);
        await fs.promises.rm(outDir, { recursive: true, force: true });
        await fs.promises.mkdir(path.join(outDir, "img"), { recursive: true });
        for (const im of draft.images ?? []) { // background pictures read in the page
          const m = /^data:[^;]+;base64,(.*)$/s.exec(im.data ?? ""); if (m && /^bg\d+\.(png|jpg|webp|svg|gif)$/.test(im.name)) await fs.promises.writeFile(path.join(outDir, "img", im.name), Buffer.from(m[1], "base64"));
        }
        for (const [k, r] of (draft.rasters ?? []).entries()) {
          const x = Math.max(0, Math.min(vw - 1, Math.round(r.left * scale))), y = Math.max(0, Math.min(vh - 1, Math.round(r.top * scale)));
          const cw = Math.max(1, Math.min(vw - x, Math.ceil(r.width * scale))), ch = Math.max(1, Math.min(vh - y, Math.ceil(r.height * scale)));
          const img = view.crop({ x, y, width: cw, height: ch });
          if (!img.isEmpty()) await fs.promises.writeFile(path.join(outDir, "img", `r${k}.png`), img.toPNG());
        }
        await fs.promises.writeFile(path.join(outDir, "frame.html"), draft.html);
        await fs.promises.writeFile(path.join(outDir, "frame.css"), draft.css);
        await fs.promises.writeFile(path.join(outDir, "shot.jpg"), view.toJPEG(82)); // the page as it was, for Claude to compare with
        await fs.promises.writeFile(path.join(outDir, "draft.json"), JSON.stringify({ url: pageUrl, title: draft.title, offset: draft.offset, width: draft.width, height: draft.height, boxes: draft.boxes }, null, 2));
        resolve({ ok: true, dir: outDir, url: pageUrl, title: draft.title, offset: draft.offset, boxes: draft.boxes, shot: path.join(outDir, "shot.jpg") });
      } catch (e) {
        if (saving) return resolve({ error: String(e?.message ?? e) });
        busy = false; w.isDestroyed() || inject(); dialog.showErrorBox("The frame could not be taken", String(e?.message ?? e));
      }
    });
    w.on("closed", () => { clearInterval(timer); if (!saving) resolve(result); });
    w.loadURL(u);
  });
  ipcMain.handle("frames:capture", guard((_e, url, env) => { // with env (editing a frame) the area it has now is chosen from the start
    let preset = null; if (env) { const p = parseFrameEnv(env), base = p && frameBase(p.scope, current), fr = base && readFrame(base, p.id); if (fr) preset = fr.offset; }
    return captureFrame(url, preset);
  }));
  // editing a frame of mine: read it, change name / offsets / html / css, or take it again from its page (the new capture replaces its parts, the name stays)
  const frameOf = (env) => { const p = parseFrameEnv(env); if (!p) throw new Error("Unknown frame."); const base = frameBase(p.scope, current); if (!base) throw new Error("No project is open."); return { ...p, base, dir: path.join(base, p.id) }; };
  ipcMain.handle("frames:get", guard((_e, env) => { const f = frameOf(env), fr = readFrame(f.base, f.id); if (!fr) throw new Error("The frame is gone."); return { env, scope: f.scope, dir: f.dir, label: fr.label, url: fr.url, offset: fr.offset, html: fr.html, css: fr.css }; }));
  // changes who sees a frame: this project only <-> all projects (the folder is moved; the id gets a number if the other side has one of that name)
  ipcMain.handle("frames:move", guard(async (_e, env, scope) => {
    const f = frameOf(env);
    if (!SCOPES.includes(scope)) throw new Error("Unknown visibility.");
    if (scope === f.scope) return { env, dir: f.dir };
    const toBase = frameBase(scope, current); if (!toBase) throw new Error("No project is open.");
    await fs.promises.mkdir(toBase, { recursive: true });
    let id = f.id, n = 2; while (fs.existsSync(path.join(toBase, id))) id = `${f.id}-${n++}`;
    const target = path.join(toBase, id);
    await fs.promises.cp(f.dir, target, { recursive: true });
    await fs.promises.rm(f.dir, { recursive: true, force: true });
    return { env: frameEnv(scope, id), dir: target };
  }));
  ipcMain.handle("frames:update", guard((_e, env, change) => { const f = frameOf(env); updateFrame(f.base, f.id, { label: change?.label, offset: change?.offset, html: change?.html, css: change?.css }); return true; }));
  // the captured draft replaces the parts of a frame of mine (html, css, pictures, offsets, link); the name stays unless a new one is given
  const applyDraftTo = async (f, label) => {
    const draft = path.join(dir(), ".studio", "frames-draft");
    const read = (n) => fs.promises.readFile(path.join(draft, n), "utf8");
    let meta; try { meta = JSON.parse(await read("draft.json")); } catch { throw new Error("There is no captured page yet."); }
    updateFrame(f.base, f.id, { label: label || undefined, url: meta.url, offset: meta.offset, html: await read("frame.html"), css: await read("frame.css").catch(() => "") });
    await fs.promises.rm(path.join(f.dir, "img"), { recursive: true, force: true });
    await fs.promises.cp(path.join(draft, "img"), path.join(f.dir, "img"), { recursive: true }).catch(() => {});
    return { ok: true, dir: f.dir, url: meta.url, boxes: meta.boxes };
  };
  ipcMain.handle("frames:applyDraft", guard((_e, env, label) => applyDraftTo(frameOf(env), String(label ?? "").trim())));
  ipcMain.handle("frames:recapture", guard(async (_e, env, url) => {
    const f = frameOf(env), fr = readFrame(f.base, f.id); if (!fr) throw new Error("The frame is gone.");
    const r = await captureFrame(String(url || fr.url || ""), fr.offset);
    return r?.ok ? applyDraftTo(f, "") : r;
  }));
  /**
   * The whole page of a window as a picture 1280 px wide: { full: JPEG for the agent and the preview, thumb: data URL for the card }. The viewport is stretched
   * to the height of the page (also of a page that scrolls inside its own area), so the fixed and sticky parts (the bar of Plus4U, the header) are drawn once, at
   * the top, instead of being repeated where the capture is stitched.
   */
  const pictureOf = async (wc) => {
    const WIDTH = 1280, MAX = 8000;
    const measure = () => wc.executeJavaScript(`(() => { const d = document.documentElement; let h = Math.max(d.scrollHeight, document.body?.scrollHeight ?? 0); for (const x of document.querySelectorAll("*")) if (x.scrollHeight > x.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(x).overflowY)) h = Math.max(h, x.scrollHeight + Math.max(0, x.getBoundingClientRect().top + scrollY)); return Math.ceil(h); })()`).catch(() => 900);
    const top = () => wc.executeJavaScript(`(() => { scrollTo(0, 0); for (const x of document.querySelectorAll("*")) if (x.scrollTop) x.scrollTop = 0; })()`).catch(() => {});
    wc.debugger.attach("1.3");
    try {
      await top();
      let height = Math.min(await measure(), MAX);
      for (let i = 0; i < 3; i++) { // the page may grow when it gets room (100vh layouts, lists that load more)
        await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: WIDTH, height, deviceScaleFactor: 1, mobile: false });
        await new Promise((r) => setTimeout(r, 1200));
        const next = Math.min(await measure(), MAX);
        if (next <= height) break;
        height = next;
      }
      await top();
      const r = await wc.debugger.sendCommand("Page.captureScreenshot", { format: "jpeg", quality: 80 });
      const img = nativeImage.createFromBuffer(Buffer.from(r.data, "base64"));
      if (img.isEmpty()) return null;
      const iw = img.getSize().width, ih = img.getSize().height;
      const thumb = img.crop({ x: 0, y: 0, width: iw, height: Math.min(ih, Math.round(800 * iw / WIDTH)) }).resize({ width: 320, quality: "good" });
      return { full: img.toJPEG(78), thumb: `data:image/jpeg;base64,${thumb.toJPEG(75).toString("base64")}` };
    } finally {
      await wc.debugger.sendCommand("Emulation.clearDeviceMetricsOverride").catch(() => {});
      try { wc.debugger.detach(); } catch { /* closed */ }
    }
  };
  // data and pictures come later than the text: wait (at most 12 s: what needs the Plus4U sign-in never loads here, a longer wait only turns its "log in" into an error) until the page is quiet: every picture finished loading, no spinner, and the same height and number of pictures on three looks in a row
  const settlePage = async (w) => {
    const look = `(() => { const im = [...document.images]; const busy = im.filter((i) => !i.complete).length + document.querySelectorAll('[class*="pending" i],[class*="loading" i],[class*="spinner" i],[class*="skeleton" i]').length; return { busy, n: im.length, h: document.documentElement.scrollHeight }; })()`;
    let last = "", same = 0;
    for (let t = 0; t < 24 && same < 3; t++) {
      await new Promise((r) => setTimeout(r, 500));
      const v = await w.webContents.executeJavaScript(look).catch(() => null);
      const key = v ? `${v.n}/${v.h}` : "";
      same = v && !v.busy && key === last ? same + 1 : 0;
      last = key;
    }
    await new Promise((r) => setTimeout(r, 500));
  };
  /**
   * Any web page (not a document of Plus4U): a hidden window of the preview session (its sign-ins are kept) opens the link, waits until the page is quiet and
   * gives { title, text, pic } (what the page shows and a picture 1280 px wide). Only http(s) is followed; the page cannot open other windows.
   */
  const readWebPage = (url) => openWebPage(url, async (w, status) => {
    const read = await w.webContents.executeJavaScript(`({ title: document.title || "", text: (document.body?.innerText || "").slice(0, 200000) })`);
    const pics = await picturesOf(w);
    const pic = await pictureOf(w.webContents).catch(() => null);
    if (status() >= 400 && !read.text.trim()) throw new Error(`The page answered with the error ${status()}.`);
    return { ...read, images: pics.images, blobs: pics.blobs, pic };
  });
  /**
   * The pictures a page shows once it is drawn (not icons: at least 48 px; backgrounds of larger blocks; og:image): { images: [{ url, alt, w, h }], blobs: [{ alt, w, h, data }] }.
   * A picture the page holds only in memory (a `blob:` address: the page downloaded it itself, e.g. with a key) has no address to download later, so its data
   * (base64, at least 96 px, at most 40 pictures of 6 MB) comes along and the app keeps it as a file.
   */
  const IMAGES_OF_PAGE = `(async () => {
    const seen = new Set(), images = [], held = [];
    const add = (u, alt, w, h) => {
      if (!u || seen.has(u)) return; seen.add(u); const it = { url: u, alt: String(alt || "").trim().slice(0, 120), w: w || 0, h: h || 0 };
      if (/^https?:/i.test(u)) { if (images.length < 120) images.push(it); } else if (/^blob:/i.test(u) && (!w || (w >= 96 && h >= 96)) && held.length < 40) held.push(it);
    };
    for (const i of document.images) if ((i.naturalWidth || i.width) >= 48 && (i.naturalHeight || i.height) >= 48) add(i.currentSrc || i.src, i.alt || i.title, i.naturalWidth, i.naturalHeight);
    for (const e of document.querySelectorAll("*")) { if (e.clientWidth < 120 || e.clientHeight < 80) continue; const b = getComputedStyle(e).backgroundImage; if (!b || !b.startsWith("url(")) continue; try { add(new URL(b.slice(4).split(")")[0].replace(/["']/g, ""), location.href).href, e.getAttribute("aria-label") || "", 0, 0); } catch (_) {} }
    const og = document.querySelector('meta[property="og:image"]'); if (og && og.content) { try { add(new URL(og.content, location.href).href, "og:image", 0, 0); } catch (_) {} }
    const blobs = [];
    for (const it of held) { try { const b = await (await fetch(it.url)).blob(); if (!b.size || b.size > 6 * 1048576 || !/^image/.test(b.type)) continue; const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); }); blobs.push({ alt: it.alt, w: it.w, h: it.h, data }); } catch (_) {} }
    return { images, blobs };
  })()`;
  // pictures that load only when they come into view: the page is scrolled through once (at most 25 000 px), then back to the top
  const LOAD_LAZY = `(async () => { const step = Math.max(400, innerHeight - 100); for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 25000); y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400)); })()`;
  const picturesOf = async (w) => { await w.webContents.executeJavaScript(LOAD_LAZY).catch(() => {}); await settlePage(w); return w.webContents.executeJavaScript(IMAGES_OF_PAGE).catch(() => ({ images: [], blobs: [] })); };
  const readWebImages = (url) => openWebPage(url, (w) => picturesOf(w));
  /**
   * The links of a web page, to derive the structure of its site: { title, links: [{ href, text, area, depth }], sitemapUrls }. `area` says where the link
   * is (nav, header, content, aside, footer), `depth` its level in the menu it belongs to (0 = top); the sitemap.xml of the site is read beside it.
   */
  const LINKS_OF_PAGE = `(() => {
    const NAVC = /(^|[-_ ])(nav|navbar|navigation|menu|mainmenu|sidebar|sidenav)([-_ ]|$)/i, FOOTC = /(^|[-_ ])(footer|foot)([-_ ]|$)/i;
    const all = [...document.querySelectorAll("a")].slice(0, 2000), total = document.querySelectorAll("a[href]").length;
    const kindOf = (el) => { const t = (el.getAttribute("role") || el.tagName).toLowerCase(), c = (typeof el.className === "string" ? el.className : "") + " " + el.id; if (t === "footer" || t === "contentinfo" || FOOTC.test(c)) return "footer"; if (t === "nav" || t === "navigation" || NAVC.test(c)) return "nav"; if (t === "header" || t === "banner") return "header"; if (t === "aside" || t === "complementary") return "aside"; return ""; };
    // the part of the page a link belongs to: the outermost menu around it (by tag, role or class name: many sites build menus of plain divs), but never a wrapper of most of the page
    const boxOf = (a) => { let best = null; for (let p = a.parentElement; p && p !== document.body; p = p.parentElement) { const k = kindOf(p); if (!k) continue; if (total > 10 && p.querySelectorAll("a[href]").length > 0.7 * total) break; if (k === "footer") return { el: p, area: k }; if (!best || k === "nav" || best.area !== "nav") best = { el: p, area: k }; } return best; };
    const lists = (a, top) => { let d = 0; for (let p = a.parentElement; p && p !== top; p = p.parentElement) if (p.tagName === "UL" || p.tagName === "OL") d++; return d; };
    const deep = (a, top) => { let d = 0; for (let p = a.parentElement; p && p !== top; p = p.parentElement) d++; return d; };
    const textOf = (a) => (a.innerText || a.textContent || a.getAttribute("aria-label") || a.title || "").replace(/\\s+/g, " ").trim().slice(0, 120);
    const rows = all.map((a) => { const b = boxOf(a), text = textOf(a); return { a, text, box: b && text ? b.el : null, area: b && text ? b.area : "content", depth: 0 }; }); // a link without a text (a logo, an icon) is no item of a menu
    // the levels of a menu: how many lists a link is nested in, else (a menu of divs) how deep it is in its menu; the levels found are numbered from 0
    for (const box of new Set(rows.map((r) => r.box).filter(Boolean))) {
      const mine = rows.filter((r) => r.box === box && r.area !== "footer");
      let raw = mine.map((r) => lists(r.a, box)); if (new Set(raw).size < 2) raw = mine.map((r) => deep(r.a, box));
      const levels = [...new Set(raw)].sort((x, y) => x - y); let rank = raw.map((v) => levels.indexOf(v));
      while (rank.length > 1 && rank.filter((v) => v === 0).length === 1 && rank.some((v) => v > 0)) rank = rank.map((v) => Math.max(0, v - 1)); // one link above all the others is a title, not their parent
      mine.forEach((r, i) => { r.depth = rank[i]; });
    }
    // an <a> without an address counts only inside a menu: there it is a heading that unfolds the items below it
    return { title: document.title || "", links: rows.filter((r) => r.a.hasAttribute("href") || r.box).map((r) => ({ href: r.a.hasAttribute("href") ? r.a.href : "", text: r.text, area: r.area, depth: r.depth })) };
  })()`;
  const readWebLinks = async (url) => {
    const [page, sitemapUrls] = await Promise.all([
      openWebPage(url, async (w, status) => { const r = await w.webContents.executeJavaScript(LINKS_OF_PAGE); if (status() >= 400 && !r.links.length) throw new Error(`The page answered with the error ${status()}.`); return r; }),
      listSitemapUrls(url).catch(() => []),
    ]);
    return { ...page, sitemapUrls };
  };
  const openWebPage = async (url, read) => {
    const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false, partition: PREVIEW_PARTITION } });
    try {
      w.webContents.setAudioMuted(true);
      w.webContents.setUserAgent(w.webContents.getUserAgent().replace(/\sElectron\/\S+/, ""));
      w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      w.webContents.on("will-navigate", (e, to) => { if (!/^https?:/i.test(to)) e.preventDefault(); });
      let status = 0;
      w.webContents.on("did-navigate", (_e, _u, code) => { status = code; });
      await Promise.race([
        w.loadURL(url),
        new Promise((_, rej) => setTimeout(() => rej(new Error("The page did not load in 45 s.")), 45000)),
      ]).catch(async (e) => {
        if (/ERR_ABORTED/.test(String(e?.message))) { // the load was cut short: by a download, or by the page itself going on to another address (a redirect of its script): then that page is the one to read
          for (let t = 0; t < 30 && w.webContents.isLoading(); t++) await new Promise((r) => setTimeout(r, 500));
          if (/^https?:/i.test(w.webContents.getURL()) && await w.webContents.executeJavaScript("Boolean(document.body && document.body.childElementCount)").catch(() => false)) return;
          throw new Error("This link is a file to download, not a page.");
        } throw new Error(`The page could not be opened: ${String(e?.message ?? e).replace(/^Error invoking remote method[^:]*: /, "") || "no answer"}`); });
      await new Promise((r) => setTimeout(r, 1000));
      await settlePage(w);
      return await read(w, () => status);
    } finally { w.destroy(); }
  };
  const captureSource = async (projectName, rel) => {
    const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false, offscreen: false, partition: PREVIEW_PARTITION } });
    try {
      await w.loadURL(`http://127.0.0.1:${port}/${encodeURIComponent(projectName)}/${rel.split(path.sep).map(encodeURIComponent).join("/")}`);
      let ready = 0;
      for (let t = 0; t < 60 && ready < 2; t++) { // the libraries come from the CDN: wait until the page shows text, twice in a row
        await new Promise((r) => setTimeout(r, 500));
        const n = await w.webContents.executeJavaScript(`(document.getElementById("uu5")?.innerText || "").trim().length`).catch(() => 0);
        ready = n >= 20 ? ready + 1 : 0;
      }
      await settlePage(w);
      return await pictureOf(w.webContents);
    } finally { w.destroy(); }
  };
  ipcMain.handle("docs:login", guard((_e, url) => docFetcher.loginFor(String(url ?? ""))));
  // on the dashboard no project is open: the documents are read into a hidden staging folder and moved into the project made for them (docs:adopt)
  const docHome = () => (current ? { name: current, dir: projects.dirOf(current) } : { name: STAGING, dir: path.join(root, STAGING) });
  fs.promises.rm(path.join(root, STAGING), { recursive: true, force: true }).catch(() => {}); // what an earlier run left behind
  ipcMain.handle("docs:fetchSource", guard((_e, url, opts) => { const home = docHome(); return docFetcher.fetchDoc(home.dir, String(url ?? ""), { allowLogin: Boolean(opts?.login), capture: (rel) => captureSource(home.name, rel), readPage: readWebPage }); }));
  // the structure of the pages behind a link (the menu of a book, the pages and links of a document or portal, the navigation of a web site): nothing is saved
  ipcMain.handle("docs:structure", guard((_e, url, opts) => docFetcher.structure(String(url ?? ""), { allowLogin: Boolean(opts?.login), readLinks: readWebLinks })));
  ipcMain.handle("docs:adopt", guard(() => { if (!current) throw new Error("No project is open."); return adoptStaging(root, current); }));
  // the picture of a document, large, for the preview of its card (only a picture made by fetchSource, in .studio/sources)
  ipcMain.handle("docs:shot", guard(async (_e, file) => {
    const base = path.join(docHome().dir, ".studio", "sources"), abs = path.resolve(String(file ?? ""));
    if (path.dirname(abs) !== base || !/\.jpg$/.test(abs)) throw new Error("Not a picture of a document.");
    return { url: `data:image/jpeg;base64,${(await fs.promises.readFile(abs)).toString("base64")}` };
  }));
  ipcMain.handle("docs:territory", guard(() => ({ store: readTerritory(), presets: presetsFor(KINDS.bookkit.plugin).map(({ name, description }) => ({ name, description })), inputs: Object.values(KINDS).map((k) => ({ id: k.input, label: k.label, current: parseAichatUrl(readTerritory()?.values?.[k.input]) })) })));
  ipcMain.handle("docs:setTerritory", guard(async (_e, choice) => { // "<preset>" or { custom: { <input>: url } }
    if (typeof choice === "string" && !presetsFor(KINDS.bookkit.plugin).some((p) => p.name === choice)) throw new Error("Unknown territory.");
    if (typeof choice !== "string" && (!choice || typeof choice.custom !== "object")) throw new Error("Unknown territory.");
    const store = writeTerritory(typeof choice === "string" ? choice : { custom: customValues(choice.custom) });
    await docFetcher.close(); // the proxies of the old territory
    return { store };
  }));
  // The model select picks the provider too: "codex" or "codex:<model>" runs Codex, everything else Claude.
  ipcMain.handle("chat:send", guard((_e, { prompt, model, plan, economy }) => {
    const viaCodex = typeof model === "string" && /^codex(:|$)/.test(model), svc = viaCodex ? codex : claude;
    if (!svc) throw new Error("No project is open.");
    svc.runChat = currentChatId;
    imageGen.reset(); // one message of the user = one run: the limit of generated pictures starts again
    svc.role = loadApp().role; // the sentence about who the user is (role.js) goes to the agent with every request
    return svc.send(prompt, viaCodex ? model.slice(6) || undefined : model, { plan: Boolean(plan), economy: Boolean(economy) });
  }));
  ipcMain.handle("chat:stop", () => stopAgents());
  ipcMain.handle("codex:status", (_e, refresh) => codexStatus({ refresh }));
  // Settings > AI providers > Codex & Plugins: what the dialog shows (Codex installed and signed in, the state of each plugin).
  ipcMain.handle("codex:pluginsState", guard(async () => { const status = await codexStatus({ refresh: true }); return { status: { ...status, version: status.installed ? await codexVersion() : null }, plugins: codexPluginStates() }; }));
  // Help > Check for Plugin Updates: Codex keeps the copy it installed, so the plugins of the marketplace are installed again when it has newer ones.
  ipcMain.handle("codex:pluginsCheck", guard(async () => {
    const bin = await findCodex({ refresh: true });
    if (!bin) return { error: "Codex was not found." };
    const before = codexPluginVersions();
    const r = await ensureCodexPlugins({ bin });
    resetCodexPlugins(); // the run of the app has seen the plugins now
    return { ...r, before, after: codexPluginVersions() };
  }));
  // The providers usable now and their models (the model list of the message field); the menu follows.
  ipcMain.handle("agents:list", guard(async (_e, refresh) => {
    const list = await listAgents({ refresh: Boolean(refresh) });
    const ids = list.map((a) => a.provider);
    if (JSON.stringify(ids) !== JSON.stringify(usableAgents)) { usableAgents = ids; projects.list().then(rebuildMenu).catch(() => {}); }
    return list;
  }));
  ipcMain.handle("claude:status", (_e, refresh) => getStatus({ refresh }));
  // ----- first run: Claude Code, sign-in, plugins (progress goes to the renderer as claude:progress)
  configureClaude({ userDataDir: app.getPath("userData") });
  ipcMain.handle("claude:installerInfo", () => ({ shown: installerCommand().shown }));
  ipcMain.handle("claude:install", guard(async () => {
    const r = await installClaude({ onLine: (line) => emit("claude:progress", { kind: "install", line }) });
    return { ok: r.ok, code: r.code, output: r.output, error: r.error, status: r.status };
  }));
  ipcMain.handle("claude:login", async (_e, opts) => { await login(opts ?? {}); return getStatus({ refresh: true }); });
  ipcMain.handle("claude:cancel", (_e, kind) => { if (kind === "login") cancelLogin(); else if (kind === "install") cancelInstall(); return true; });
  ipcMain.handle("claude:installPlugins", guard(async () => {
    const r = await installPlugins({ onStep: (s) => emit("claude:progress", { kind: "plugins", ...s }) });
    return { ...r, status: await getStatus({ refresh: true }) };
  }));
  // Plugin updates are offered, never applied silently: the catalog is refreshed at most every 6 hours (or when asked), "Later" postpones one version.
  ipcMain.handle("plugins:check", guard(async (_e, force) => {
    const app_ = loadApp();
    if (!shouldCheck(app_.pluginsCheckedAt, Date.now(), Boolean(force))) return { updates: app_.pluginUpdates ?? [], skipped: true };
    const r = await checkPluginUpdates({ later: app_.pluginsLater ?? {} });
    if (r.checked) saveApp({ pluginsCheckedAt: Date.now(), pluginUpdates: r.updates });
    return r;
  }));
  ipcMain.handle("plugins:later", guard((_e, updates) => { const later = { ...(loadApp().pluginsLater ?? {}) }; for (const u of updates ?? []) later[u.id] = u.latest; saveApp({ pluginsLater: later, pluginUpdates: [] }); return true; }));
  ipcMain.handle("plugins:update", guard(async (_e, ids) => {
    const r = await updatePlugins(Array.isArray(ids) ? ids : [], { onStep: (s) => emit("claude:progress", { kind: "plugins", ...s }) });
    if (r.ok) saveApp({ pluginUpdates: [] });
    return { ...r, status: await getStatus({ refresh: true }) };
  }));
  ipcMain.handle("open:external", (_e, url) => /^https:\/\//.test(url) && shell.openExternal(url));

  const cdnStatus = async () => ({ offline, ...(await cdn.stats()) });
  ipcMain.handle("cdn:status", cdnStatus);
  ipcMain.handle("cdn:offline", async (_e, v) => { offline = Boolean(v); saveApp({ offline }); projects.list().then(rebuildMenu); return cdnStatus(); });
  ipcMain.handle("cdn:clear", async () => { await cdn.clear(); return cdnStatus(); });
  ipcMain.handle("cdn:warmup", async () => {
    warming = true;
    const results = [];
    try {
      for (const [i, g] of WARMUP_GROUPS.entries()) {
        emit("cdn:progress", { index: i, total: WARMUP_GROUPS.length, name: g.name });
        results.push({ name: g.name, ...(await warmGroup(i)) });
      }
    } finally { warming = false; }
    return { results, status: await cdnStatus() };
  });
  async function warmGroup(i) {
    const w = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    const errors = [];
    w.webContents.on("console-message", (e) => (e.level === "error" || e.level === 3) && errors.push(String(e.message).split("\n")[0].slice(0, 200)));
    try {
      await w.loadURL(`http://127.0.0.1:${port}/__warmup/${i}.html`);
      for (let t = 0; t < 120; t++) {
        const txt = await w.webContents.executeJavaScript(`document.getElementById("uu5")?.innerText ?? ""`).catch(() => "");
        if (txt.startsWith("ok")) return { ok: true };
        await new Promise((r) => setTimeout(r, 500));
      }
      return { ok: false, error: errors[0] ?? "timeout" };
    } catch (e) { return { ok: false, error: e.message }; } finally { w.destroy(); }
  }

  // Export. STUDIO_EXPORT_DIR skips the save dialog (used by automated checks).
  const pickDest = async (name, ext, label) => {
    if (process.env.STUDIO_EXPORT_DIR) return path.join(process.env.STUDIO_EXPORT_DIR, name);
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: label, extensions: [ext] }] });
    return r.canceled ? null : r.filePath;
  };
  // A picture or text made by the renderer (the sitemap as PNG / SVG): saved through the same dialog.
  ipcMain.handle("export:data", guard(async (_e, o) => {
    const ext = o?.ext === "svg" ? "svg" : "png", name = (path.basename(String(o?.name ?? `export.${ext}`)).replace(/[^\w.\- ]+/g, "_") || `export.${ext}`).replace(/\.[^.]*$/, "") + `.${ext}`;
    const dest = await pickDest(name, ext, ext === "svg" ? "SVG" : "PNG");
    if (!dest) return { canceled: true };
    await fs.promises.writeFile(dest, ext === "svg" ? String(o?.text ?? "") : Buffer.from(String(o?.base64 ?? ""), "base64"));
    return { path: dest };
  }));
  ipcMain.handle("clipboard:image", guard(async (_e, base64) => {
    const buf = Buffer.from(String(base64 ?? ""), "base64");
    if (nativeImage.createFromBuffer(buf).isEmpty()) return { error: "The picture could not be read." };
    // this Electron has no clipboard.writeImage: the clipboard takes ClipboardItems (as for the PNG of a screen)
    await clipboard.write([new ClipboardItem({ "image/png": new Blob([buf], { type: "image/png" }) })]);
    return { ok: true };
  }));
  ipcMain.handle("export:html", guard(async (_e, file) => {
    const dest = await pickDest(path.basename(file), "html", "HTML");
    return dest ? { path: await exportHtml(dir(), file, dest) } : { canceled: true };
  }));
  // the Electron clipboard works also when the window is not focused (navigator.clipboard does not)
  ipcMain.handle("clipboard:text", guard(async (_e, text) => { await clipboard.writeText(String(text ?? "")); return { ok: true }; }));
  ipcMain.handle("export:text", guard(async (_e, name, text) => {
    if (typeof text !== "string") throw new Error("Nothing to save.");
    const dest = await pickDest(path.basename(String(name)), "txt", "Text");
    if (!dest) return { canceled: true };
    fs.writeFileSync(dest, text, "utf8");
    return { path: dest };
  }));
  // The files (pictures, videos) a uu5String refers to: a document does not have them, so they come as a ZIP beside the text.
  ipcMain.handle("assets:list", guard(async (_e, text) => ({ files: (await findAssets(dir(), [String(text ?? "")])).map((a) => a.zipPath) })));
  ipcMain.handle("assets:export", guard(async (_e, name, text) => {
    const base = path.basename(String(name)).replace(/\.html$/, "");
    const dest = await pickDest(`${base}.assets.zip`, "zip", "ZIP");
    if (!dest) return { canceled: true };
    const files = await writeUu5Assets(dir(), String(text ?? ""), dest, base);
    if (!files) throw new Error("The uu5String refers to no file of the project.");
    return { path: dest, files };
  }));
  // Save the uu5String and, when it refers to files of the project, their ZIP next to it (<name>.assets.zip).
  ipcMain.handle("export:uu5", guard(async (_e, name, text) => {
    if (typeof text !== "string" || !text) throw new Error("Nothing to save.");
    const dest = await pickDest(path.basename(String(name)), "txt", "Text");
    if (!dest) return { canceled: true };
    fs.writeFileSync(dest, text, "utf8");
    const zip = dest.replace(/(\.uu5string)?\.txt$|$/, ".assets.zip");
    const files = await writeUu5Assets(dir(), text, zip, path.basename(dest).replace(/\.uu5string\.txt$|\.txt$/, ""));
    return { path: dest, files, assetsPath: files ? zip : undefined };
  }));
  // The handoff specification (one Markdown document for the people who build it): to a file, or as text for the clipboard.
  const handoffText = async () => {
    const repo = await repoView(await loadChats(dir()));
    return buildHandoff(await gatherHandoff(dir(), { project: current, repo: repo && !repo.error ? `${repo.name}${repo.view ? ` (branch ${repo.view})` : ""}` : "" }));
  };
  ipcMain.handle("export:handoff", guard(async (_e, mode) => {
    const text = await handoffText();
    if (mode === "text") return { text };
    const dest = await pickDest(`${current}-specification.md`, "md", "Markdown");
    if (!dest) return { canceled: true };
    await fs.promises.writeFile(dest, text);
    return { path: dest };
  }));
  // Comments on the components of a screen (comments.mjs): files beside the screens, so they travel with the project
  const author = () => String(loadApp().author || "").trim() || defaultAuthor();
  // "Use this variant": the variant takes the place of the original and the rest goes to the trash; on the original it keeps the original and trashes the variants
  ipcMain.handle("variant:keep", guard(async (_e, file) => {
    const r = await keepVariantFiles(dir(), path.basename(String(file)), { trash: (p) => shell.trashItem(p), screens: listScreens() });
    emit("memory:changed", { project: current, kind: "comments", screens: screensWithComments(dir()) });
    emit("memory:changed", { project: current, kind: "project" });
    return r;
  }));
  // the sitemap of the project: <project>/sitemap.json (see sitemapFile.mjs)
  ipcMain.handle("sitemap:read", guard(async () => (await readSitemap(dir())) ?? { sitemap: null, hasPrev: false }));
  ipcMain.handle("sitemap:write", guard(async (_e, sitemap, opts) => { await writeSitemap(dir(), sitemap, { backup: Boolean(opts?.backup) }); return (await readSitemap(dir())); }));
  ipcMain.handle("sitemap:restore", guard(async () => (await restoreSitemap(dir())) ?? { error: "There is nothing to take back." }));
  // plans: Markdown files in <project>/plans (see plans.mjs)
  ipcMain.handle("plans:list", guard(() => listPlans(dir())));
  ipcMain.handle("plans:read", guard((_e, slug) => readPlan(dir(), slug)));
  ipcMain.handle("plans:write", guard(async (_e, slug, text) => { await writePlan(dir(), slug, text); return true; }));
  ipcMain.handle("plans:status", guard(async (_e, slug, status) => { if (!STATUSES.includes(status)) throw new Error("Unknown status."); await writePlan(dir(), slug, withStatus((await readPlan(dir(), slug)).text, status)); return true; }));
  ipcMain.handle("plans:save", guard((_e, plan) => savePlan(dir(), { slug: plan?.slug, title: plan?.title, markdown: plan?.markdown, status: plan?.status })));
  ipcMain.handle("plans:remove", guard(async (_e, slug) => { await removePlan(dir(), slug, { trash: (p) => shell.trashItem(p) }); return true; }));
  ipcMain.handle("flow:edges", guard(() => findFlowEdges(Object.fromEntries(listScreens().map((f) => [f, fs.readFileSync(path.join(dir(), f), "utf8")])))));
  ipcMain.handle("comments:get", guard((_e, file) => readComments(dir(), file)));
  ipcMain.handle("comments:all", guard(async () => Object.fromEntries(await Promise.all(screensWithComments(dir()).map(async (f) => [f, await readComments(dir(), f)])))));
  ipcMain.handle("comments:change", guard(async (_e, file, op) => { const list = await changeComments(dir(), file, op, { author: author() }); emit("memory:changed", { project: current, kind: "comments", screens: screensWithComments(dir()) }); return { comments: list }; }));
  ipcMain.handle("comments:author", guard((_e, name) => { if (typeof name === "string") saveApp({ author: name.trim().slice(0, 60) }); return { author: author() }; }));
  ipcMain.handle("export:zip", guard(async () => {
    const dest = await pickDest(`${current}.zip`, "zip", "ZIP");
    return dest ? { path: dest, ...(await exportZip(dir(), dest)) } : { canceled: true };
  }));
  // Image export: PNG / JPEG / PDF of the whole page at the frame's current device size
  const render = (file, format) => {
    const wc = browser.viewOf(file);
    if (!wc) throw new Error(`Screen ${file} is not shown on the canvas.`);
    return captureScreen(wc, { format, nativeImage });
  };
  ipcMain.handle("export:image", guard(async (_e, file, format = "png") => {
    const base = path.basename(file, ".html");
    let dest;
    if (process.env.STUDIO_EXPORT_DIR) dest = path.join(process.env.STUDIO_EXPORT_DIR, `${base}.${IMAGE_FORMATS[format].ext}`);
    else {
      const r = await dialog.showSaveDialog(win, { defaultPath: `${base}.png`, filters: Object.values(IMAGE_FORMATS).map((f) => ({ name: f.label, extensions: [f.ext] })) });
      if (r.canceled) return { canceled: true };
      dest = r.filePath;
    }
    await fs.promises.writeFile(dest, await render(file, formatFromPath(dest)));
    return { path: dest };
  }));

  // Share by e-mail: macOS opens the system share sheet (Mail composes a message with the attachment); elsewhere an
  // unsent .eml draft with the attachment is opened in the default mail client. STUDIO_MAIL_DRY_RUN only prepares the files.
  /** The file to share (HTML copy, PNG render or project ZIP) written to a temp folder. */
  const SHARE_DIR = path.join(os.tmpdir(), "uu5studio-share");
  async function prepareShare(kind, file, text) {
    const out = SHARE_DIR; await fs.promises.mkdir(out, { recursive: true });
    let name, data, label; const extra = [];
    if (kind === "uu5") { // the text comes from the renderer (collected from the rendered screen)
      if (typeof text !== "string" || !text) throw new Error("Nothing to share.");
      label = path.basename(String(file), ".html"); name = `${label}.uu5string.txt`; data = Buffer.from(text, "utf8"); await fs.promises.writeFile(path.join(out, name), data);
      const zipName = `${label}.assets.zip`; // the pictures and videos the text refers to travel with it
      if (await writeUu5Assets(dir(), text, path.join(out, zipName), label)) extra.push({ name: zipName, data: await fs.promises.readFile(path.join(out, zipName)), path: path.join(out, zipName) });
    } else if (kind === "zip") { name = `${current}.zip`; await exportZip(dir(), path.join(out, name)); data = await fs.promises.readFile(path.join(out, name)); label = current; }
    else if (kind === "png") { name = `${path.basename(file, ".html")}.png`; data = await render(file, "png"); await fs.promises.writeFile(path.join(out, name), data); label = path.basename(file, ".html"); }
    else { name = path.basename(file); data = await fs.promises.readFile(path.join(dir(), name)); await fs.promises.writeFile(path.join(out, name), data); label = path.basename(file, ".html"); }
    return { out, name, data, label, attachment: path.join(out, name), extra };
  }
  // Drag a screen as a file into a chat, a mail or a folder. The file is prepared while the pointer is over the handle (a drag
  // has to start at once), `drag:start` then hands it to the operating system.
  const dragIcon = nativeImage.createFromPath(path.join(here, "../renderer/assets/icon.png")).resize({ width: 64 });
  // Copy of the Share menu: the image as an image, the HTML as its source text, the project ZIP as a file (macOS: pasted into
  // Finder, Mail, Messages … like a file copied in Finder; elsewhere its path as text). Electron's clipboard takes ClipboardItems.
  ipcMain.handle("clipboard:out", guard(async (_e, kind, file) => {
    if (kind === "png") { await clipboard.write([new ClipboardItem({ "image/png": new Blob([await render(file, "png")], { type: "image/png" }) })]); return { ok: true }; }
    if (kind === "html") { await clipboard.writeText(await fs.promises.readFile(path.join(dir(), path.basename(String(file))), "utf8")); return { ok: true }; }
    if (kind === "zip") {
      const { attachment } = await prepareShare("zip", file);
      if (process.platform !== "darwin") { await clipboard.writeText(attachment); return { ok: true, pathOnly: true }; }
      await clipboard.write([new ClipboardItem({ 'electron application/osclipboard;format="public.file-url"': new Blob([pathToFileURL(attachment).href], { type: "text/plain" }), "text/plain": attachment })]);
      return { ok: true };
    }
    throw new Error(`Unknown kind: ${kind}`);
  }));
  ipcMain.handle("drag:prepare", guard(async (_e, kind, file, text) => ({ path: (await prepareShare(kind, file, text)).attachment })));
  ipcMain.on("drag:start", (e, filePath) => {
    const target = path.resolve(String(filePath));
    if (target.startsWith(SHARE_DIR + path.sep) && fs.existsSync(target)) e.sender.startDrag({ file: target, icon: dragIcon });
  });
  ipcMain.handle("share:mail", guard(async (_e, kind, file, text) => {
    const { out, name, data, label, attachment, extra } = await prepareShare(kind, file, text);
    if (process.platform === "darwin" && !process.env.STUDIO_MAIL_DRY_RUN) { new ShareMenu({ filePaths: [attachment, ...extra.map((x) => x.path)] }).popup({ window: win }); return { shared: true, method: "share-sheet", path: attachment }; }
    const eml = path.join(out, `${name}.eml`);
    await fs.promises.writeFile(eml, buildEml({ subject: `uu5 mockup: ${label}`, body: mailBody(kind === "zip" || kind === "uu5" ? kind : "html", label), attachments: [{ name, data }, ...extra.map(({ name, data }) => ({ name, data }))] }));
    if (!process.env.STUDIO_MAIL_DRY_RUN) { const err = await shell.openPath(eml); if (err) throw new Error(`Could not open the mail client: ${err}`); }
    return { shared: true, method: "eml", path: eml };
  }));
  ipcMain.handle("screen:reveal", guard((_e, file) => void shell.showItemInFolder(path.join(dir(), path.basename(String(file))))));
  ipcMain.handle("screen:deleteInfo", guard((_e, file) => screenMemoryInfo(dir(), path.basename(String(file)))));
  ipcMain.handle("screen:delete", guard(async (_e, file) => {
    const name = path.basename(String(file));
    if (!name.endsWith(".html")) throw new Error("Only .html screens can be deleted.");
    const target = path.join(dir(), name);
    if (!fs.existsSync(target)) throw new Error(`File ${name} no longer exists.`);
    await shell.trashItem(target);
    if (fs.existsSync(target)) throw new Error(`Could not delete file ${name}.`);
    const note = notePath(dir(), name); if (fs.existsSync(note)) await shell.trashItem(note); // the note goes with its screen
    const memory = await forgetScreen(dir(), name); // and so do its rules and its description (a copy stays in .studio/removed-screen-memory.md)
    return { ok: true, ...memory };
  }));

  // ----- project memory: a linked git repository (read-only for the agent), business rules, notes of a screen
  const applyRepo = async (readDir, label) => { for (const svc of [claude, codex]) if (svc) { svc.repoDir = readDir; svc.repoLabel = label; } };
  ipcMain.handle("repo:link", guard(async () => {
    // STUDIO_PICK_REPO: scripted runs (demo recording, tests) name the folder instead of using the native dialog
    const r = process.env.STUDIO_PICK_REPO ? { canceled: false, filePaths: [process.env.STUDIO_PICK_REPO] } : await dialog.showOpenDialog(win, { title: "Choose the folder of the git repository", properties: ["openDirectory"], buttonLabel: "Link repository" });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const info = await validateRepo(r.filePaths[0]);
    const st = await updateState(dir(), (s) => { s.repo = { path: info.path }; return s; });
    await applyRepo(info.path, "");
    repoLinked = true; rebuildMenu(await projects.list());
    return repoView(st);
  }));
  ipcMain.handle("repo:unlink", guard(async () => {
    const st = await readState(dir());
    await updateState(dir(), (s) => { delete s.repo; return s; });
    if (st.repo?.viewDir?.startsWith(VIEWS_DIR)) await fs.promises.rm(st.repo.viewDir, { recursive: true, force: true });
    await applyRepo(null, "");
    repoLinked = false; rebuildMenu(await projects.list());
    return { ok: true };
  }));
  ipcMain.handle("repo:open", guard(async () => {
    const st = await readState(dir()); if (!st.repo?.path) throw new Error("No repository is linked.");
    const err = await shell.openPath(st.repo.path); if (err) throw new Error(`Could not open the folder: ${err}`);
    return { ok: true };
  }));
  ipcMain.handle("repo:branches", guard(async () => {
    const st = await readState(dir()); if (!st.repo?.path) return { current: "", branches: [], view: null };
    return { ...(await listBranches(st.repo.path)), view: st.repo.view ?? null };
  }));
  // Pick the branch Claude reads: null / the checked-out branch = the repository itself (live files); another branch = a read-only snapshot.
  // The checkout, the working tree and .git of the repository are never touched.
  ipcMain.handle("repo:setBranch", guard(async (_e, branch) => {
    const st = await readState(dir()); if (!st.repo?.path) throw new Error("No repository is linked.");
    const { current } = await listBranches(st.repo.path);
    const old = st.repo.viewDir;
    let next;
    if (!branch || branch === current) next = { path: st.repo.path };
    else next = { path: st.repo.path, view: String(branch), viewDir: await snapshotBranch({ repoDir: st.repo.path, branch: String(branch), baseDir: VIEWS_DIR }) };
    const out = await updateState(dir(), (s) => { s.repo = next; return s; });
    if (old && old !== next.viewDir && old.startsWith(VIEWS_DIR)) await fs.promises.rm(old, { recursive: true, force: true });
    await applyRepo(next.viewDir ?? next.path, next.view ? `snapshot of branch ${next.view}` : "");
    return repoView(out);
  }));
  ipcMain.handle("repo:files", guard(async (_e, query) => {
    const st = await readState(dir()); if (!st.repo?.path) return [];
    return listRepoFiles(st.repo.path, String(query ?? ""), st.repo.view ? { ref: st.repo.view } : {});
  }));
  // the rules of all projects: GLOBAL_RULES.md in the folder that holds the projects
  ipcMain.handle("rules:getGlobal", guard(() => readGlobalRules(root)));
  ipcMain.handle("rules:setGlobal", guard(async (_e, text) => { await writeGlobalRules(root, String(text)); return { ok: true }; }));
  ipcMain.handle("rules:addGlobal", guard(async (_e, text) => appendGlobalRule(root, text)));
  try { // the agent or the user changes the file: the dialog follows
    let t; fs.watch(root, (_evt, file) => { if (file !== GLOBAL_FILE) return; clearTimeout(t); t = setTimeout(() => emit("memory:changed", { kind: "global" }), 250); });
  } catch { /* the folder cannot be watched */ }
  ipcMain.handle("rules:get", guard(() => readRules(dir())));
  ipcMain.handle("rules:set", guard(async (_e, text) => { await writeRules(dir(), String(text)); lastRules = String(text); return { ok: true }; }));
  ipcMain.handle("rules:add", guard(async (_e, text, screen) => { const r = await appendRule(dir(), text, screen || null); lastRules = r.content; return r; }));
  // the brand guide (DESIGN_GUIDE.md) and the manual it was distilled from (.studio/brand/source)
  ipcMain.handle("brand:get", guard(async () => ({ guide: await readGuide(dir()), template: GUIDE_TEMPLATE, sources: (await listSources(dir())).map((f) => path.basename(f)) })));
  ipcMain.handle("brand:set", guard(async (_e, text) => { await writeGuide(dir(), String(text)); return { ok: true }; }));
  // the manual is read in the app itself (text of the PDF, colours, fonts, sizes) and the guide is filled; progress goes to the dialog
  ipcMain.handle("brand:import", guard(async (_e, items) => {
    const files = await saveSources(dir(), items), found = [];
    for (const f of files) {
      const name = path.basename(f.path);
      found.push({ name, ...(await importManual(dir(), f.path, (pr) => emit("brand:progress", { project: current, file: name, ...pr }))) });
    }
    return { files: files.map((f) => f.path), found };
  }));
  ipcMain.handle("brand:reread", guard(async (_e, name) => {
    const f = path.join(sourceDir(dir()), path.basename(String(name)));
    const r = await importManual(dir(), f, (pr) => emit("brand:progress", { project: current, file: path.basename(f), ...pr }));
    return { found: [{ name: path.basename(f), ...r }] };
  }));
  ipcMain.handle("brand:improve", guard(async () => ({ prompt: distillPrompt((await listSources(dir())).map((f) => ({ path: f, kind: sourceKind(f) })), dir()) })));
  ipcMain.handle("brand:remove", guard(async (_e, name) => { await removeSource(dir(), name); return { ok: true }; }));
  ipcMain.handle("brand:check", guard(async (_e, file) => {
    const guide = await readGuide(dir()), t = parseTokens(guide);
    if (!t.colors.length && !t.fonts.length) return { empty: true };
    const name = path.basename(String(file)), r = checkScreen(fs.readFileSync(path.join(dir(), name), "utf8"), guide);
    return { file: name, ...r, prompt: fixPrompt(name, r, dir()) };
  }));
  ipcMain.handle("desc:get", guard(() => readProject(dir())));
  ipcMain.handle("desc:set", guard(async (_e, text) => { await writeProject(dir(), String(text)); return { ok: true }; }));
  ipcMain.handle("notes:get", guard((_e, file) => readNotes(dir(), file)));
  ipcMain.handle("notes:set", guard(async (_e, file, notes) => ({ notes: await writeNotes(dir(), file, notes) })));
  ipcMain.handle("notes:newId", guard((_e, taken) => newNoteId(Array.isArray(taken) ? taken : [])));

  const updater = setupUpdater({ app, emit });
  let wasFullScreen = false;
  ipcMain.handle("window:fullscreen", (_e, on) => {
    if (on) { wasFullScreen = win.isFullScreen(); win.setFullScreen(true); }
    else if (!wasFullScreen) win.setFullScreen(false);
    return win.isFullScreen();
  });
  ipcMain.handle("theme:set", (_e, t) => void (nativeTheme.themeSource = ["light", "dark"].includes(t) ? t : "system"));
  // App updates from the releases on GitHub (no code signing needed): newer version -> the installer is offered for download in the browser.
  // A build with an update feed (see updater.mjs) keeps using electron-updater instead.
  const UPDATE_REPO = process.env.STUDIO_UPDATE_REPO || DEFAULT_REPO;
  const fetchJson = async (url) => { const r = await net.fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "uu5Mock-Studio" }, signal: AbortSignal.timeout(10_000) }); return { status: r.status, json: r.ok ? await r.json() : null }; };
  /** The update found earlier that is still newer than this version and was not postponed ("Later"). */
  const knownUpdate = () => { const a = loadApp(), u = a.appUpdate; return u && compareVersions(app.getVersion(), u.version) < 0 && a.updateLater !== u.version ? u : null; };
  async function checkAppUpdate({ manual }) {
    if (!manual && !shouldCheck(loadApp().updateCheckedAt)) return { status: "skipped" }; // in the background at most every 6 hours
    const r = await checkGithub({ current: app.getVersion(), repo: UPDATE_REPO, fetchJson, api: process.env.STUDIO_UPDATE_API || undefined }); // STUDIO_UPDATE_API: tests point it at a local server
    if (r.status === "error") return r; // a failure is only reported to someone who asked
    saveApp({ updateCheckedAt: Date.now(), appUpdate: r.status === "available" ? { version: r.version, url: r.url, notes: r.notes, asset: r.asset, zip: r.zip } : null });
    if (r.status === "available" && (manual || loadApp().updateLater !== r.version)) emit("update:event", { type: "available", source: "github", ...r });
    return r;
  }
  ipcMain.handle("update:check", () => (updater.enabled ? updater.check() : checkAppUpdate({ manual: true })));
  ipcMain.handle("update:install", () => updater.install());
  ipcMain.handle("glass:toggle", () => (process.platform === "darwin" ? toggleGlass() : false)); // the same switch as Settings > Appearance > Glass effect, for the ⋯ menu
  // macOS without a Developer ID certificate: the app downloads the release zip, checks it, and a script swaps the bundle after it quits
  let selfInstalling = false;
  const selfUpdateOk = () => canSelfUpdate({ packaged: app.isPackaged, hasFeed: updater.enabled });
  ipcMain.handle("update:selfinstall", async () => {
    if (selfInstalling) return { error: "The update is already being installed." };
    const u = loadApp().appUpdate;
    if (!u?.zip || compareVersions(app.getVersion(), u.version) >= 0) return { error: "There is no newer version to install." };
    if (!isRepoUrl(u.zip.url, UPDATE_REPO) && !(process.env.STUDIO_UPDATE_DOWNLOADS && u.zip.url.startsWith(process.env.STUDIO_UPDATE_DOWNLOADS))) return { error: "The update is not from the project repository." };
    if (!(await selfUpdateOk())) return { error: "This app cannot replace itself here. Download the installer instead." };
    selfInstalling = true;
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "uu5mock-update-")), bundle = bundlePath(process.execPath), stageDir = path.join(path.dirname(bundle), `.uu5mock-update-${process.pid}`);
    try {
      const zip = path.join(work, u.zip.name);
      await downloadTo(zip, u.zip.url, { fetchFn: net.fetch, size: u.zip.size, sha256: digestHex(u.zip.digest), onProgress: (percent) => emit("update:event", { type: "progress", percent }) });
      emit("update:event", { type: "installing", version: u.version });
      const staged = await unpackAndCheck(zip, stageDir, { bundleId: "net.uu5mock.studio", version: u.version });
      startSwap({ target: bundle, staged, stageDir });
      setTimeout(() => app.quit(), 400);
      return { ok: true };
    } catch (e) {
      fs.rmSync(stageDir, { recursive: true, force: true }); selfInstalling = false;
      return { error: e?.message ?? "The update failed." };
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  });
  // the welcome tour is shown on the first run only (STUDIO_NO_TOUR: tests and the demo recorder start from a fresh profile)
  ipcMain.handle("tour:done", () => void saveApp({ tourSeen: true }));
  // the role of the user (role.js): chosen once, changeable in Help; an unknown value is refused
  ipcMain.handle("role:set", (_e, role) => { if (!isRole(role)) return { error: "Unknown role." }; saveApp({ role, roleAsked: true }); return { ok: true, role }; });
  ipcMain.handle("role:skip", () => { saveApp({ roleAsked: true }); return { ok: true }; });
  ipcMain.handle("update:later", (_e, version) => void saveApp({ updateLater: String(version) }));
  ipcMain.handle("update:open", (_e, url) => (isRepoUrl(url, UPDATE_REPO) ? shell.openExternal(url).then(() => ({ ok: true })) : { error: "Only pages of the project repository on GitHub can be opened." }));
  // versions of what the app is built from (for the About dialog)
  const depVersion = (name) => { try { return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "node_modules", name, "package.json"), "utf8")).version; } catch { return null; } };
  nativeTheme.on("updated", () => emit("glass:set", glassOn())); // Reduce transparency was switched in System Settings
  ipcMain.handle("app:meta", async () => ({
    version: app.getVersion(), platform: process.platform, glass: glassOn(), tourSeen: Boolean(loadApp().tourSeen) || Boolean(process.env.STUDIO_NO_TOUR), role: isRole(loadApp().role) ? loadApp().role : null, roleAsked: Boolean(loadApp().roleAsked) || Boolean(process.env.STUDIO_NO_TOUR), updates: updater.enabled, selfUpdate: await selfUpdateOk(), appUpdate: updater.enabled ? null : knownUpdate(),
    runtime: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    deps: Object.fromEntries(["@anthropic-ai/claude-agent-sdk", "@babel/parser", "fflate", "electron-updater"].map((n) => [n, depVersion(n)])),
  }));
  ipcMain.handle("reveal", (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle("project:reveal", guard(() => shell.openPath(dir())));
  if (updater.enabled) setTimeout(() => updater.check(), 10_000);
  else if (app.isPackaged) setTimeout(() => checkAppUpdate({ manual: false }), 12_000); // a development run does not nag

  win.loadFile(path.join(here, "../renderer/index.html"));
});

app.on("window-all-closed", () => app.quit());
