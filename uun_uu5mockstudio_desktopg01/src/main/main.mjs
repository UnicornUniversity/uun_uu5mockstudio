import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, net, session, shell, ShareMenu } from "electron";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startMockServer } from "./mockServer.mjs";
import { ClaudeService } from "./claudeService.mjs";
import { createStudioBrowser } from "./studioBrowserMcp.mjs";
import { createScreenHistory } from "./screenHistory.mjs";
import { getStatus, login, cancelLogin, installClaude, cancelInstall, installerCommand, installPlugins, checkPluginUpdates, updatePlugins, configure as configureClaude } from "./claudeEnv.mjs";
import { shouldCheck } from "./pluginUpdates.mjs";
import { createCdnCache } from "./cdnCache.mjs";
import { WARMUP_GROUPS, warmupPage } from "./warmup.mjs";
import { exportHtml, exportZip } from "./exporter.mjs";
import { resolveProjectsRoot } from "./paths.mjs";
import { createProjects, readState, updateState, writeState } from "./projects.mjs";
import * as chats from "./chats.mjs";
import { saveAttachments } from "./attachments.mjs";
import { setupUpdater } from "./updater.mjs";
import { loadBml } from "./uuBml.mjs";
import { checkGithub, isRepoUrl, DEFAULT_REPO } from "./githubUpdates.mjs";
import { compareVersions } from "./prerequisites.mjs";
import { bundlePath, canSelfUpdate, downloadTo, digestHex, unpackAndCheck, startSwap } from "./selfUpdate.mjs";
import { captureScreen, formatFromPath, IMAGE_FORMATS } from "./capture.mjs";
import { buildEml, mailBody } from "./mailDraft.mjs";
import { buildMenuTemplate } from "./menu.mjs";
import { tagHtml, structureOf, structureOutline, moveElements, describeElement, describeItem, elementNames, setProp, removeProp, setItemProp, removeItemProp, setBranch, setItemBranch, describeList, addItem, removeItem, moveItem, duplicateItem, replaceItem, setText } from "./jsxSource.mjs";
import { createDocs, describeComponents } from "./uu5Docs.mjs";
import { loadIcons } from "./uuGdsIcons.mjs";
import { validateRepo, listRepoFiles, listBranches, snapshotBranch } from "./repo.mjs";
import { RULES_FILE, GLOBAL_FILE, readGlobalRules, writeGlobalRules, appendGlobalRule, readRules, writeRules, readProject, writeProject, migrateDescriptions, appendRule, summarizeChange, readNotes, writeNotes, newNoteId, notePath, screensWithNotes } from "./rules.mjs";

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
  // lastProject === null means the user closed the project last time: start without one (first run: undefined -> default project)
  const startName = loadApp().lastProject;
  let current = startName === null ? null : await projects.ensure(startName);
  const dir = () => { if (!current) throw new Error("No project is open."); return projects.dirOf(current); };
  const listScreens = () => fs.readdirSync(dir()).filter((f) => f.endsWith(".html"));

  const routes = Object.fromEntries(WARMUP_GROUPS.map((g, i) => [`/__warmup/${i}.html`, warmupPage(g)]));
  const { port } = await startMockServer(root, { routes, transformHtml: tagHtml }); // serves every project: /<project>/<screen>.html

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
    titleBarStyle: "hiddenInset",
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
  let repoLinked = false; // does the open project have a linked repository? (enables the Git items of the Project menu)
  function rebuildMenu(list) {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({
      platform: process.platform, appName: "uu5Mock Studio", projects: list, current, repoLinked, glass, offline, isDev: !app.isPackaged,
      send: (action) => {
        if (action === "project:reveal" && current) shell.openPath(dir());
        else if (action === "folder:projects-open") projectsFolder("open");
        else if (action === "folder:projects-change") projectsFolder("change");
        else if (action === "view:glass") toggleGlass();
        else emit("menu:action", action);
      },
    })));
  }
  /** The folder that holds all projects: open it in the file manager, or pick another one (applied by restarting the app). */
  async function projectsFolder(op) {
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
  ipcMain.handle("docs:libraries", () => ({ available: docs.available(), libraries: docs.libraries() }));
  ipcMain.handle("docs:detail", (_e, name) => { const doc = typeof name === "string" ? docs.get(name) : null; return doc ? { name, library: docs.list().find((c) => c.name === name)?.library ?? "", file: docs.file(name), ...doc } : null; });
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
    return { applied: r.applied, failed: r.failed, structure: structureOf(r.html, String(file).replace(/\.html$/, "")) };
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

  const browser = createStudioBrowser({
    baseUrl: `http://127.0.0.1:${port}`,
    onNavigated: (screen) => emit("preview:navigated", screen),
    readStructure: (file) => { const f = path.basename(String(file)); const t = structureOf(fs.readFileSync(screenPath(f), "utf8"), f.replace(/\.html$/, "")); return t ? structureOutline(t) : null; },
  });

  // ----- per-project runtime: Claude session and file watcher follow the open project
  let claude, watcher, watchTimer;
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
  const newClaude = async () => {
    const name = current, projectDir = dir();
    const st = await loadChats(projectDir);
    currentChatId = st.currentChatId;
    const svc = new ClaudeService({
      repoDir: await repoReadDir(st), repoLabel: st.repo?.view ? `snapshot of branch ${st.repo.view}` : "",
      cwd: projectDir, urlBase: `http://127.0.0.1:${port}/${encodeURIComponent(name)}`, browserMcp: browser.server, globalRoot: root, docs,
      sessionId: chats.current(st).sessionId ?? undefined,
      onEvent: (m) => {
        if (name !== current) return; // late events of a project that is no longer open
        if (svc.runChat && svc.runChat !== currentChatId) return; // late events of a conversation that is no longer open
        if (m.session_id && svc.runChat) updateState(projectDir, (s) => chats.setSession(chats.normalize(s), svc.runChat, m.session_id)).catch(() => {});
        emit("claude:event", m);
      },
    });
    return svc;
  };
  // Project memory: BUSINESS_RULES.md and <screen>.notes.md. `lastRules` is the version the user has already seen, so that a change made
  // by the agent (or by hand outside the app) is reported once with what was added, while our own saves are silent.
  let lastRules = "";
  const startWatch = () => {
    const name = current, changed = new Set();
    let rulesDirty = false, notesDirty = false, projectDirty = false;
    watcher = fs.watch(dir(), (_evt, file) => {
      if (file?.endsWith(".html")) changed.add(file);
      if (file === RULES_FILE) rulesDirty = true;
      if (file === "PROJECT.md") projectDirty = true;
      if (file?.endsWith(".notes.md")) notesDirty = true;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(async () => {
        if (name !== current) return;
        emit("preview:changed", { project: name, screens: listScreens(), changed: [...changed] }); changed.clear();
        if (rulesDirty) { rulesDirty = false; const now = await readRules(dir()), s = summarizeChange(lastRules, now); lastRules = now; if (s.added.length || s.removed.length) emit("memory:changed", { project: name, kind: "rules", ...s }); }
        if (projectDirty) { projectDirty = false; emit("memory:changed", { project: name, kind: "project" }); }
        if (notesDirty) { notesDirty = false; emit("memory:changed", { project: name, kind: "notes", screens: screensWithNotes(dir()) }); }
      }, 250);
    });
  };
  /** The repository linked to the open project as the UI shows it: { path, name, branch } or { path, name, error } when it is gone. */
  const repoView = async (state) => {
    const p = state?.repo?.path; if (!p) return null;
    try { return { ...(await validateRepo(p)), view: state.repo.view ?? null, readDir: (await repoReadDir(state)) ?? p }; } catch (e) { return { path: p, name: path.basename(p), error: e.message }; }
  };
  const payload = async () => {
    const list = await projects.list();
    repoLinked = current ? Boolean((await readState(dir()))?.repo?.path) : false;
    rebuildMenu(list); // every change of the open project / project list flows through here
    const base = { port, webviewPreload: pathToFileURL(path.join(here, "webviewPreload.cjs")).href, project: current, projects: list };
    if (!current) { currentChatId = null; return { ...base, screens: [], chat: [], chatId: null, chats: [], layout: null }; }
    const state = await loadChats(dir());
    currentChatId = state.currentChatId;
    return { ...base, screens: listScreens(), chat: chats.current(state).entries, chatId: state.currentChatId, chats: chats.list(state), layout: state.layout, repo: await repoView(state), notes: screensWithNotes(dir()) };
  };
  /** Close the open project: back to the start screen, nothing runs for it any more. */
  const closeProject = async () => {
    claude?.stop(); watcher?.close(); clearTimeout(watchTimer);
    claude = null; current = null; currentChatId = null; saveApp({ lastProject: null });
    return payload();
  };
  /** Switch the whole workspace (chat, canvas, Claude session, watcher) to another project. */
  const openProject = async (name) => {
    claude?.stop(); watcher?.close(); clearTimeout(watchTimer);
    current = name; saveApp({ lastProject: name });
    fs.mkdirSync(dir(), { recursive: true });
    await migrateDescriptions(dir()).catch(() => {}); claude = await newClaude(); lastRules = await readRules(dir()); startWatch();
    return payload();
  };
  if (current) await openProject(current);
  rebuildMenu(await projects.list());

  ipcMain.handle("app:info", payload);
  ipcMain.handle("projects:list", () => projects.list());
  ipcMain.handle("projects:close", guard(() => closeProject()));
  ipcMain.handle("projects:open", guard((_e, name) => openProject(name)));
  ipcMain.handle("projects:create", guard(async (_e, name) => openProject(await projects.create(name))));
  ipcMain.handle("projects:rename", guard(async (_e, from, to) => {
    const wasCurrent = from === current;
    if (!wasCurrent) { await projects.rename(from, to); return payload(); }
    claude?.stop(); watcher?.close();
    try { return await openProject(await projects.rename(from, to)); }
    catch (e) { await openProject(from); throw e; }
  }));
  ipcMain.handle("projects:delete", guard(async (_e, name) => {
    if (name !== current) { await projects.remove(name); return payload(); }
    claude?.stop(); watcher?.close();
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
    claude.stop();
    let created = false;
    const st = await mutateChats((s) => { created = chats.newChat(s).created; });
    claude.setSession(chats.current(st).sessionId);
    return { created, ...chatView(st) };
  }));
  ipcMain.handle("chat:switch", guard(async (_e, id) => {
    claude.stop();
    const st = await mutateChats((s) => chats.switchChat(s, id));
    claude.setSession(chats.current(st).sessionId);
    return chatView(st);
  }));
  ipcMain.handle("chat:delete", guard(async (_e, id) => {
    if (id === currentChatId) claude.stop();
    const st = await mutateChats((s) => chats.deleteChat(s, id));
    claude.setSession(chats.current(st).sessionId);
    return chatView(st);
  }));
  ipcMain.handle("attachments:save", guard((_e, items) => saveAttachments(dir(), items)));
  ipcMain.handle("chat:send", guard((_e, { prompt, model, plan }) => { if (!claude) throw new Error("No project is open."); claude.runChat = currentChatId; return claude.send(prompt, model, { plan: Boolean(plan) }); }));
  ipcMain.handle("chat:stop", () => claude?.stop());
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
  ipcMain.handle("export:html", guard(async (_e, file) => {
    const dest = await pickDest(path.basename(file), "html", "HTML");
    return dest ? { path: await exportHtml(dir(), file, dest) } : { canceled: true };
  }));
  ipcMain.handle("export:zip", guard(async () => {
    const dest = await pickDest(`${current}.zip`, "zip", "ZIP");
    return dest ? { path: dest, ...(await exportZip(dir(), dest)) } : { canceled: true };
  }));
  // Image export: PNG / JPEG / PDF of the whole page at the frame's current device size
  const render = (file, format) => {
    const wc = browser.viewOf(file);
    if (!wc) throw new Error(`Screen ${file} is not shown on the canvas.`);
    return captureScreen(wc, { format });
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
  async function prepareShare(kind, file) {
    const out = SHARE_DIR; await fs.promises.mkdir(out, { recursive: true });
    let name, data, label;
    if (kind === "zip") { name = `${current}.zip`; await exportZip(dir(), path.join(out, name)); data = await fs.promises.readFile(path.join(out, name)); label = current; }
    else if (kind === "png") { name = `${path.basename(file, ".html")}.png`; data = await render(file, "png"); await fs.promises.writeFile(path.join(out, name), data); label = path.basename(file, ".html"); }
    else { name = path.basename(file); data = await fs.promises.readFile(path.join(dir(), name)); await fs.promises.writeFile(path.join(out, name), data); label = path.basename(file, ".html"); }
    return { out, name, data, label, attachment: path.join(out, name) };
  }
  // Drag a screen as a file into a chat, a mail or a folder. The file is prepared while the pointer is over the handle (a drag
  // has to start at once), `drag:start` then hands it to the operating system.
  const dragIcon = nativeImage.createFromPath(path.join(here, "../renderer/assets/icon.png")).resize({ width: 64 });
  ipcMain.handle("drag:prepare", guard(async (_e, kind, file) => ({ path: (await prepareShare(kind, file)).attachment })));
  ipcMain.on("drag:start", (e, filePath) => {
    const target = path.resolve(String(filePath));
    if (target.startsWith(SHARE_DIR + path.sep) && fs.existsSync(target)) e.sender.startDrag({ file: target, icon: dragIcon });
  });
  ipcMain.handle("share:mail", guard(async (_e, kind, file) => {
    const { out, name, data, label, attachment } = await prepareShare(kind, file);
    if (process.platform === "darwin" && !process.env.STUDIO_MAIL_DRY_RUN) { new ShareMenu({ filePaths: [attachment] }).popup({ window: win }); return { shared: true, method: "share-sheet", path: attachment }; }
    const eml = path.join(out, `${name}.eml`);
    await fs.promises.writeFile(eml, buildEml({ subject: `uu5 mockup: ${label}`, body: mailBody(kind === "zip" ? "zip" : "html", label), attachments: [{ name, data }] }));
    if (!process.env.STUDIO_MAIL_DRY_RUN) { const err = await shell.openPath(eml); if (err) throw new Error(`Could not open the mail client: ${err}`); }
    return { shared: true, method: "eml", path: eml };
  }));
  ipcMain.handle("screen:reveal", guard((_e, file) => void shell.showItemInFolder(path.join(dir(), path.basename(String(file))))));
  ipcMain.handle("screen:delete", guard(async (_e, file) => {
    const name = path.basename(String(file));
    if (!name.endsWith(".html")) throw new Error("Only .html screens can be deleted.");
    const target = path.join(dir(), name);
    if (!fs.existsSync(target)) throw new Error(`File ${name} no longer exists.`);
    await shell.trashItem(target);
    if (fs.existsSync(target)) throw new Error(`Could not delete file ${name}.`);
    const note = notePath(dir(), name); if (fs.existsSync(note)) await shell.trashItem(note); // the note goes with its screen
    return { ok: true };
  }));

  // ----- project memory: a linked git repository (read-only for the agent), business rules, notes of a screen
  const applyRepo = async (readDir, label) => { if (claude) { claude.repoDir = readDir; claude.repoLabel = label; } };
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
  ipcMain.handle("glass:toggle", () => (process.platform === "darwin" ? toggleGlass() : false)); // the same switch as View > Appearance > Glass Effect, for the ⋯ menu
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
  ipcMain.handle("update:later", (_e, version) => void saveApp({ updateLater: String(version) }));
  ipcMain.handle("update:open", (_e, url) => (isRepoUrl(url, UPDATE_REPO) ? shell.openExternal(url).then(() => ({ ok: true })) : { error: "Only pages of the project repository on GitHub can be opened." }));
  // versions of what the app is built from (for the About dialog)
  const depVersion = (name) => { try { return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "node_modules", name, "package.json"), "utf8")).version; } catch { return null; } };
  nativeTheme.on("updated", () => emit("glass:set", glassOn())); // Reduce transparency was switched in System Settings
  ipcMain.handle("app:meta", async () => ({
    version: app.getVersion(), platform: process.platform, glass: glassOn(), tourSeen: Boolean(loadApp().tourSeen) || Boolean(process.env.STUDIO_NO_TOUR), updates: updater.enabled, selfUpdate: await selfUpdateOk(), appUpdate: updater.enabled ? null : knownUpdate(),
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
