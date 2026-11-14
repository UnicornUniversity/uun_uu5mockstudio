/**
 * Application menu as a plain template (Electron's Menu.buildFromTemplate input), so it can be tested without Electron.
 * Custom items only send an action id to the renderer, which owns the dialogs and UI state; Edit/Window items are
 * standard roles (text editing shortcuts in the chat field depend on them).
 */
export function buildMenuTemplate({ platform = process.platform, appName = "uu5Mock Studio", projects = [], current = null, repoLinked = false, glass = false, offline = false, isDev = false, agents = null, screenHasVariants = false, send = () => {} }) {
  // Everything that is set up once (role, look, AI providers, integrations, offline cache) lives in Settings…; the menus hold actions.
  // Which AI providers are shown there is decided in the renderer (settingsModel.js) from the same `agents`.
  const mac = platform === "darwin";
  const has = Boolean(current);
  const act = (id) => () => send(id);
  const item = (label, id, extra = {}) => ({ label, click: act(id), ...extra });
  const sep = { type: "separator" };
  const fileManager = mac ? "Finder" : platform === "win32" ? "Explorer" : "File Manager";

  const openProject = {
    label: "Open Project",
    submenu: projects.length
      ? projects.map((p) => ({ label: p.name, type: "radio", checked: p.name === current, click: act("project:open:" + p.name) }))
      : [{ label: "(no projects yet)", enabled: false }],
  };

  // File: the life cycle of a project and what leaves the app. Everything about the project itself is in Project.
  const file = {
    label: "File",
    submenu: [
      item("New Project…", "project:new", { accelerator: "CmdOrCtrl+N" }),
      openProject,
      item("Switch Project…", "project:switcher", { accelerator: "CmdOrCtrl+O" }),
      item("Templates…", "templates:open"),
      item("Dashboard", "project:close", { accelerator: "Shift+CmdOrCtrl+D", enabled: has }),
      item("Close Project", "project:close", { accelerator: "Shift+CmdOrCtrl+W", enabled: has }),
      sep,
      { label: "Export", enabled: has, submenu: [
        item("Screen as Image (PNG, JPEG, PDF)…", "screen:image"),
        item("Screen as HTML…", "screen:html"),
        item("Copy Screen as uu5String", "screen:uu5string"),
        item("Screen as uu5String…", "screen:save-uu5string"),
        item("Project as ZIP…", "project:zip"),
        item("Project Specification (Markdown)…", "project:handoff"),
        item("Copy Project Specification", "project:handoff-copy"),
      ] },
      { label: "Share", enabled: has, submenu: [
        item("Screen Image…", "screen:share-png"),
        item("Screen HTML File…", "screen:share-html"),
        item("Screen as uu5String…", "screen:share-uu5"),
        item("Project ZIP…", "project:share-zip"),
      ] },
      sep,
      ...(mac ? [] : [item("Settings…", "settings:open", { accelerator: "CmdOrCtrl+," }), sep]),
      mac ? { role: "close", label: "Close Window" } : { role: "quit", label: "Quit" },
    ],
  };

  // Project: what the project is made of and knows (description, rules, git), where it lives, and removing it.
  const project = {
    label: "Project",
    submenu: [
      item("Rename Project…", "project:rename", { enabled: has }),
      item("Project Description…", "project:desc", { accelerator: "Alt+CmdOrCtrl+D", enabled: has }),
      item("Business Rules…", "project:rules", { accelerator: "Alt+CmdOrCtrl+R", enabled: has }),
      item("Brand Guidelines…", "brand:open", { accelerator: "Alt+CmdOrCtrl+B", enabled: has }),
      { label: "Git Repository", enabled: has, submenu: [
        item(repoLinked ? "Change Repository…" : "Link Repository…", "project:repo-link"),
        item("Switch Branch…", "repo:branch", { enabled: repoLinked }),
        item("Open Repository Folder", "repo:open", { enabled: repoLinked }),
        sep,
        item("Unlink Repository", "repo:unlink", { enabled: repoLinked }),
      ] },
      sep,
      item(`Show Project in ${fileManager}`, "project:reveal", { enabled: has }),
      { label: "Projects Folder", submenu: [
        item(`Show in ${fileManager}`, "folder:projects-open"),
        item("Change…", "folder:projects-change"),
      ] },
      sep,
      item("Delete Project…", "project:delete", { enabled: has }),
    ],
  };

  // Screen: actions on the selected screen (the same ones as in its ⋯ and right-click menu). Undo / Redo of a screen change are the
  // standard ones of Edit (outside a text field they undo the last change of the screen), so they are not repeated here; "Use This
  // Variant…" is there only while the selected screen is a variant or has variants (`screenHasVariants`, sent by the renderer).
  const screen = {
    label: "Screen",
    submenu: [
      item("Present", "screen:fullscreen", { accelerator: "CmdOrCtrl+Enter", enabled: has }),
      item("Reload Screen", "screen:reload", { enabled: has }),
      sep,
      item("Add Note", "screen:note", { accelerator: "Alt+CmdOrCtrl+N", enabled: has }),
      item("Description…", "screen:desc", { enabled: has }),
      item("Variants…", "screen:variants", { enabled: has }),
      ...(has && screenHasVariants ? [item("Use This Variant…", "screen:keepvariant")] : []),
      item("Show Component Tree…", "screen:structure", { enabled: has }),
      item("Save as Template…", "screen:template", { enabled: has }),
      item("Add Rule…", "screen:rule", { enabled: has }),
      item("Mention in Chat", "screen:mention", { enabled: has }),
      sep,
      item(`Show in ${fileManager}`, "screen:reveal", { enabled: has }),
      item("Delete Screen…", "screen:delete", { enabled: has }),
    ],
  };

  const chat = {
    label: "Chat",
    submenu: [
      item("New Chat", "chat:new", { accelerator: "Shift+CmdOrCtrl+N", enabled: has }),
      item("Chat History…", "chat:history", { enabled: has }),
      sep,
      item("Floating / Docked Chat", "view:chatmode", { accelerator: "Shift+CmdOrCtrl+L" }),
    ],
  };

  const edit = {
    label: "Edit",
    // Undo / Redo: in a text field they undo the typing, anywhere else the last change of the screen (the renderer decides)
    submenu: [item("Undo", "edit:undo", { accelerator: "CmdOrCtrl+Z" }), item("Redo", "edit:redo", { accelerator: "Shift+CmdOrCtrl+Z" }), sep, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
  };

  const view = {
    label: "View",
    submenu: [
      item("Zoom In", "view:zoomin", { accelerator: "CmdOrCtrl+=" }),
      item("Zoom Out", "view:zoomout", { accelerator: "CmdOrCtrl+-" }),
      item("Show All Screens", "view:fit", { accelerator: "CmdOrCtrl+0" }),
      item("Arrange Screens", "view:arrange", { enabled: has }),
      { label: "Device for All Screens", enabled: has, submenu: [["Desktop", "desktop"], ["Laptop", "laptop"], ["Tablet", "tablet"], ["Mobile", "mobile"]].map(([l, d]) => item(l, "view:device:" + d)) },
      sep,
      item("Edit Components", "view:inspector", { enabled: has }),
      item("Show / Hide Screen Flow", "view:flow", { enabled: has }),
      ...(mac ? [] : [sep, { role: "togglefullscreen" }]), // macOS adds its own Enter Full Screen item to the View menu
      ...(isDev ? [sep, { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }] : []),
    ],
  };

  const windowMenu = { label: "Window", submenu: [{ role: "minimize" }, ...(mac ? [{ role: "zoom" }, sep, { role: "front" }] : [{ role: "close" }])] };
  const help = { label: "Help", submenu: [item("Welcome Tour…", "app:tour"), sep, item("Check for Updates…", "update:check"), ...(mac ? [] : [sep, item(`About ${appName}`, "app:about")])] };

  const appMenu = {
    label: appName,
    submenu: [
      item(`About ${appName}`, "app:about"), item("Check for Updates…", "update:check"), sep,
      item("Settings…", "settings:open", { accelerator: "CmdOrCtrl+," }), sep,
      { role: "services" }, sep, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, sep, { role: "quit" },
    ],
  };

  return [...(mac ? [appMenu] : []), file, edit, project, screen, chat, view, windowMenu, help];
}
