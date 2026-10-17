/**
 * Application menu as a plain template (Electron's Menu.buildFromTemplate input), so it can be tested without Electron.
 * Custom items only send an action id to the renderer, which owns the dialogs and UI state; Edit/Window items are
 * standard roles (text editing shortcuts in the chat field depend on them).
 */
export function buildMenuTemplate({ platform = process.platform, appName = "uu5Mock Studio", projects = [], current = null, isDev = false, send = () => {} }) {
  const mac = platform === "darwin";
  const has = Boolean(current);
  const act = (id) => () => send(id);
  const item = (label, id, extra = {}) => ({ label, click: act(id), ...extra });
  const sep = { type: "separator" };

  const openProject = {
    label: "Open Project",
    submenu: projects.length
      ? projects.map((p) => ({ label: p.name, type: "radio", checked: p.name === current, click: act("project:open:" + p.name) }))
      : [{ label: "(no projects yet)", enabled: false }],
  };

  const file = {
    label: "File",
    submenu: [
      item("New Project…", "project:new", { accelerator: "CmdOrCtrl+N" }),
      openProject,
      item("Project Switcher…", "project:switcher", { accelerator: "CmdOrCtrl+O" }),
      item("Close Project", "project:close", { accelerator: "Shift+CmdOrCtrl+W", enabled: has }),
      sep,
      item("Rename Project…", "project:rename", { enabled: has }),
      item("Delete Project…", "project:delete", { enabled: has }),
      item("Open Projects Folder", "folder:projects-open"),
      item("Change Projects Folder…", "folder:projects-change"),
      item("Reveal Project Folder", "project:reveal", { enabled: has }),
      item("Project Description…", "project:desc", { enabled: has }),
      item("Business Rules…", "project:rules", { enabled: has }),
      item("Link Git Repository…", "project:repo-link", { enabled: has }),
      sep,
      item("New Chat", "chat:new", { accelerator: "Shift+CmdOrCtrl+N", enabled: has }),
      item("Chat History", "chat:history", { enabled: has }),
      sep,
      { label: "Export", enabled: has, submenu: [
        item("Screen as Image (PNG, JPEG, PDF)…", "screen:image"),
        item("Screen as HTML…", "screen:html"),
        item("Project as ZIP…", "project:zip"),
      ] },
      { label: "Share", enabled: has, submenu: [
        item("Screen Image…", "screen:share-png"),
        item("Screen HTML File…", "screen:share-html"),
        item("Project ZIP…", "project:share-zip"),
      ] },
      sep,
      mac ? { role: "close", label: "Close Window" } : { role: "quit", label: "Quit" },
    ],
  };

  const edit = {
    label: "Edit",
    submenu: [{ role: "undo" }, { role: "redo" }, sep, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
  };

  const view = {
    label: "View",
    submenu: [
      item("Zoom In", "view:zoomin", { accelerator: "CmdOrCtrl+=" }),
      item("Zoom Out", "view:zoomout", { accelerator: "CmdOrCtrl+-" }),
      item("Show All Screens", "view:fit", { accelerator: "CmdOrCtrl+0" }),
      item("Arrange Screens", "view:arrange", { enabled: has }),
      sep,
      item("Fullscreen Preview of Selected Screen", "view:fullscreen", { accelerator: "Shift+CmdOrCtrl+F", enabled: has }),
      item("Element Inspector", "view:inspector", { enabled: has }),
      item("Floating / Docked Chat", "view:chatmode", { accelerator: "Shift+CmdOrCtrl+L" }),
      sep,
      { label: "Appearance", submenu: [
        item("Automatic", "view:theme:auto"), item("Light", "view:theme:light"), item("Dark", "view:theme:dark"),
      ] },
      ...(mac ? [] : [{ role: "togglefullscreen" }]), // macOS adds its own Enter Full Screen item to the View menu
      ...(isDev ? [sep, { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }] : []),
    ],
  };

  const windowMenu = { label: "Window", submenu: [{ role: "minimize" }, ...(mac ? [{ role: "zoom" }, sep, { role: "front" }] : [{ role: "close" }])] };
  const help = { label: "Help", submenu: [item("Set Up Claude Code…", "claude:setup"), item("Check for Plugin Updates…", "plugins:check"), sep, item("Check for Updates…", "update:check"), ...(mac ? [] : [sep, item(`About ${appName}`, "app:about")])] };

  const appMenu = {
    label: appName,
    submenu: [
      item(`About ${appName}`, "app:about"), item("Check for Updates…", "update:check"), sep,
      { role: "services" }, sep, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, sep, { role: "quit" },
    ],
  };

  return [...(mac ? [appMenu] : []), file, edit, view, windowMenu, help];
}
