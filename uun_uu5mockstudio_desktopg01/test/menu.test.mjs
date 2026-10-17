import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuTemplate } from "../src/main/menu.mjs";

const find = (items, label) => items.find((i) => i.label === label);
const projects = [{ name: "Alfa", screens: 2 }, { name: "Beta", screens: 0 }];

test("macOS has an app menu first, then File, Edit, View, Window, Help", () => {
  const t = buildMenuTemplate({ platform: "darwin", appName: "uu5Mock Studio", projects, current: "Alfa" });
  assert.deepEqual(t.map((m) => m.label), ["uu5Mock Studio", "File", "Edit", "View", "Window", "Help"]);
  assert.ok(t[0].submenu.some((i) => i.role === "quit"));
});

test("other platforms have no app menu and quit lives in the File menu", () => {
  const t = buildMenuTemplate({ platform: "win32", projects, current: "Alfa" });
  assert.equal(t[0].label, "File");
  assert.ok(find(t[0].submenu, "Quit")?.role === "quit");
});

test("project items are in File with the usual accelerators and send action ids", () => {
  const sent = [];
  const t = buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", send: (a) => sent.push(a) });
  const file = find(t, "File").submenu;
  assert.equal(find(file, "New Project…").accelerator, "CmdOrCtrl+N");
  assert.equal(find(file, "Close Project").accelerator, "Shift+CmdOrCtrl+W");
  find(file, "New Project…").click(); find(file, "Close Project").click(); find(file, "New Chat").click();
  assert.deepEqual(sent, ["project:new", "project:close", "chat:new"]);
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
  for (const l of ["Close Project", "Rename Project…", "Delete Project…", "Reveal Project Folder", "New Chat", "Export", "Share"]) assert.equal(find(file, l).enabled, false, l);
  assert.notEqual(find(file, "New Project…").enabled, false);
  assert.notEqual(find(file, "Project Switcher…").enabled, false);
});

test("no projects at all: the submenu says so instead of being empty", () => {
  const sub = find(find(buildMenuTemplate({ platform: "darwin", projects: [] }), "File").submenu, "Open Project").submenu;
  assert.equal(sub.length, 1); assert.equal(sub[0].enabled, false);
});

test("Edit menu keeps the standard text editing roles", () => {
  const roles = find(buildMenuTemplate({ platform: "darwin", projects }), "Edit").submenu.map((i) => i.role).filter(Boolean);
  assert.deepEqual(roles, ["undo", "redo", "cut", "copy", "paste", "selectAll"]);
});

test("View exposes canvas zoom, fullscreen and theme; developer tools only in dev", () => {
  const view = (isDev) => find(buildMenuTemplate({ platform: "darwin", projects, current: "Alfa", isDev }), "View").submenu;
  assert.equal(find(view(false), "Show All Screens").accelerator, "CmdOrCtrl+0");
  assert.equal(find(view(false), "Fullscreen Preview of Selected Screen").accelerator, "Shift+CmdOrCtrl+F");
  assert.deepEqual(find(view(false), "Appearance").submenu.map((i) => i.label), ["Automatic", "Light", "Dark"]);
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
