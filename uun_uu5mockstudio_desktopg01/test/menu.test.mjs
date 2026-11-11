import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuTemplate } from "../src/main/menu.mjs";

const find = (items, label) => items.find((i) => i.label === label);
const projects = [{ name: "Alfa", screens: 2 }, { name: "Beta", screens: 0 }];

test("macOS has an app menu first, then File, Edit, Project, Screen, Chat, View, Window, Help", () => {
  const t = buildMenuTemplate({ platform: "darwin", appName: "uu5Mock Studio", projects, current: "Alfa" });
  assert.deepEqual(t.map((m) => m.label), ["uu5Mock Studio", "File", "Edit", "Project", "Screen", "Chat", "View", "Window", "Help"]);
  assert.ok(t[0].submenu.some((i) => i.role === "quit"));
});

test("other platforms have no app menu and quit lives in the File menu", () => {
  const t = buildMenuTemplate({ platform: "win32", projects, current: "Alfa" });
  assert.equal(t[0].label, "File");
  assert.ok(find(t[0].submenu, "Quit")?.role === "quit");
});

test("File keeps the life cycle of a project and what leaves the app, and sends action ids", () => {
  const sent = [];
  const t = buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", send: (a) => sent.push(a) });
  const file = find(t, "File").submenu;
  assert.equal(find(file, "New Project…").accelerator, "CmdOrCtrl+N");
  assert.equal(find(file, "Switch Project…").accelerator, "CmdOrCtrl+O");
  assert.equal(find(file, "Close Project").accelerator, "Shift+CmdOrCtrl+W");
  find(file, "New Project…").click(); find(file, "Close Project").click(); find(file, "Switch Project…").click();
  assert.deepEqual(sent, ["project:new", "project:close", "project:switcher"]);
  const labels = file.map((i) => i.label).filter(Boolean);
  for (const moved of ["Rename Project…", "Delete Project…", "Business Rules…", "Project Description…", "New Chat", "Chat History"]) assert.ok(!labels.includes(moved), `${moved} must not be in File`);
  assert.ok(labels.length <= 9, "File stays short: " + labels.join(", "));
});

test("Project holds description, rules, git, location and deletion", () => {
  const sent = [];
  const project = find(buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", send: (a) => sent.push(a) }), "Project").submenu;
  assert.equal(find(project, "Business Rules…").accelerator, "Alt+CmdOrCtrl+R");
  assert.equal(find(project, "Project Description…").accelerator, "Alt+CmdOrCtrl+D");
  for (const l of ["Rename Project…", "Project Description…", "Business Rules…", "Brand Guidelines…", "Show Project in Finder", "Delete Project…"]) assert.ok(find(project, l), l);
  find(project, "Rename Project…").click(); find(project, "Business Rules…").click(); find(project, "Delete Project…").click();
  assert.deepEqual(sent, ["project:rename", "project:rules", "project:delete"]);
  assert.deepEqual(find(project, "Projects Folder").submenu.map((i) => i.label), ["Show in Finder", "Change…"]);
  assert.ok(find(buildMenuTemplate({ platform: "win32", projects, current: "Alfa" }), "Project").submenu.some((i) => i.label === "Show Project in Explorer"));
});

test("Git Repository: link first, the rest only once a repository is linked", () => {
  const git = (repoLinked) => find(find(buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", repoLinked }), "Project").submenu, "Git Repository").submenu;
  assert.ok(find(git(false), "Link Repository…")); assert.equal(find(git(false), "Link Repository…").enabled, undefined);
  for (const l of ["Switch Branch…", "Open Repository Folder", "Unlink Repository"]) { assert.equal(find(git(false), l).enabled, false, l); assert.equal(find(git(true), l).enabled, true, l); }
  assert.ok(find(git(true), "Change Repository…") && !find(git(true), "Link Repository…"));
});

test("Screen and Chat menus carry the actions that used to hide in File and in the screen menu", () => {
  const sent = [];
  const t = buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", send: (a) => sent.push(a) });
  const screen = find(t, "Screen").submenu, chat = find(t, "Chat").submenu;
  assert.equal(find(screen, "Present").accelerator, "CmdOrCtrl+Enter");
  assert.equal(find(screen, "Add Note").accelerator, "Alt+CmdOrCtrl+N");
  for (const l of ["Reload Screen", "Description…", "Add Rule…", "Mention in Chat", "Show in Finder", "Delete Screen…"]) assert.ok(find(screen, l), l);
  assert.equal(find(chat, "New Chat").accelerator, "Shift+CmdOrCtrl+N"); assert.equal(find(chat, "Floating / Docked Chat").accelerator, "Shift+CmdOrCtrl+L");
  find(screen, "Description…").click(); find(screen, "Add Rule…").click(); find(chat, "Chat History…").click();
  assert.deepEqual(sent, ["screen:desc", "screen:rule", "chat:history"]);
});

test("Open Project lists every project, ticks the open one and opens by name", () => {
  const sent = [];
  const t = buildMenuTemplate({ platform: "darwin", projects, current: "Beta", send: (a) => sent.push(a) });
  const sub = find(find(t, "File").submenu, "Open Project").submenu;
  assert.deepEqual(sub.map((i) => [i.label, i.checked]), [["Alfa", false], ["Beta", true]]);
  sub[0].click(); assert.deepEqual(sent, ["project:open:Alfa"]);
});

test("without an open project the project-specific items are disabled and creating one is not", () => {
  const t = buildMenuTemplate({ platform: "darwin", projects, current: null });
  const file = find(t, "File").submenu;
  for (const l of ["Dashboard", "Close Project", "Export", "Share"]) assert.equal(find(file, l).enabled, false, l);
  assert.notEqual(find(file, "New Project…").enabled, false);
  assert.notEqual(find(file, "Switch Project…").enabled, false);
  for (const [menu, labels] of [["Project", ["Rename Project…", "Delete Project…", "Business Rules…", "Project Description…", "Show Project in Finder"]], ["Screen", ["Present", "Reload Screen", "Add Note", "Description…", "Delete Screen…"]], ["Chat", ["New Chat", "Chat History…"]]]) {
    for (const l of labels) assert.equal(find(find(t, menu).submenu, l).enabled, false, `${menu} > ${l}`);
  }
  assert.notEqual(find(find(t, "Project").submenu, "Projects Folder").enabled, false);
});

test("no projects at all: the submenu says so instead of being empty", () => {
  const sub = find(find(buildMenuTemplate({ platform: "darwin", projects: [] }), "File").submenu, "Open Project").submenu;
  assert.equal(sub.length, 1); assert.equal(sub[0].enabled, false);
});

test("Edit menu keeps the standard text editing roles", () => {
  const edit = find(buildMenuTemplate({ platform: "darwin", projects }), "Edit").submenu;
  assert.deepEqual(edit.map((i) => i.role).filter(Boolean), ["cut", "copy", "paste", "selectAll"]);
  const steps = edit.filter((i) => /^edit:/.test(i.action ?? "") || i.label === "Undo" || i.label === "Redo");
  assert.deepEqual(steps.map((i) => i.label), ["Undo", "Redo"], "Undo and Redo go through the app: a text field or the last change of the screen");
});

test("View exposes canvas zoom and inspector; developer tools only in dev", () => {
  const view = (isDev) => find(buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", isDev }), "View").submenu;
  assert.equal(find(view(false), "Show All Screens").accelerator, "CmdOrCtrl+0");
  assert.ok(find(view(false), "Edit Components")); assert.ok(!find(view(false), "Fullscreen Preview of Selected Screen"), "fullscreen preview moved to Screen");
  for (const moved of ["Appearance", "Offline Use", "Picture Generation…"]) assert.equal(find(view(false), moved), undefined, `${moved} lives in Settings`);
  assert.ok(!view(false).some((i) => i.role === "toggleDevTools"));
  assert.ok(view(true).some((i) => i.role === "toggleDevTools"));
});

test("every custom item has a click handler and no accelerator is used twice", () => {
  const t = buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", isDev: true });
  const all = []; const walk = (items) => items.forEach((i) => { all.push(i); if (i.submenu) walk(i.submenu); }); walk(t);
  for (const i of all) if (i.label && !i.role && !i.type && i.submenu === undefined && i.enabled !== false) assert.equal(typeof i.click, "function", i.label);
  const accs = all.map((i) => i.accelerator).filter(Boolean);
  assert.equal(new Set(accs).size, accs.length, "duplicate accelerators: " + accs);
});

test("Settings… is in the app menu on macOS and in File elsewhere, with ⌘, and without a second copy", () => {
  const sent = [];
  const t = (platform) => buildMenuTemplate({ platform, projects, current: "Alfa", send: (a) => sent.push(a) });
  const settings = (items) => find(items, "Settings…");
  const mac = t("darwin");
  assert.equal(settings(find(mac, "uu5Mock Studio").submenu).accelerator, "CmdOrCtrl+,");
  assert.equal(settings(find(mac, "File").submenu), undefined);
  for (const p of ["win32", "linux"]) {
    const item = settings(find(t(p), "File").submenu);
    assert.equal(item.accelerator, "CmdOrCtrl+,");
    item.click();
  }
  settings(find(mac, "uu5Mock Studio").submenu).click();
  assert.deepEqual(sent, ["settings:open", "settings:open", "settings:open"]);
});

test("the setups moved into Settings are not in Help, View or the app menu any more", () => {
  const labels = (platform) => JSON.stringify(buildMenuTemplate({ platform, agents: ["claude", "codex"] }).map((m) => (m.submenu ?? []).map((i) => [i.label, ...(i.submenu ?? []).map((x) => x.label)])));
  for (const p of ["darwin", "win32"]) {
    for (const moved of ["Your Role…", "Claude Code & Plugins…", "Codex & Plugins…", "uuAiChat MCP Server…", "Picture Generation…", "Appearance", "Offline Use"]) assert.ok(!labels(p).includes(moved), `${moved} (${p})`);
  }
  assert.deepEqual(find(buildMenuTemplate({ platform: "darwin" }), "Help").submenu.map((i) => i.label).filter(Boolean), ["Welcome Tour…", "Check for Updates…"]);
});
