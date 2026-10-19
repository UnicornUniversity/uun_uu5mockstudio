/**
 * Application menu as a plain template (Electron's Menu.buildFromTemplate input), so it can be tested without Electron.
 * Custom items only send an action id to the renderer, which owns the dialogs and UI state; Edit/Window items are
 * standard roles (text editing shortcuts in the chat field depend on them).
 */
export function buildMenuTemplate({ platform = process.platform, appName = "uu5Mock Studio", projects = [], current = null, repoLinked = false, glass = false, offline = false, isDev = false, send = () => {} }) {
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
      item("Close Project", "project:close", { accelerator: "Shift+CmdOrCtrl+W", enabled: has }),
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

  // Project: what the project is made of and knows (description, rules, git), where it lives, and removing it.
  const project = {
    label: "Project",
    submenu: [
      item("Rename Project…", "project:rename", { enabled: has }),
      item("Project Description…", "project:desc", { accelerator: "Alt+CmdOrCtrl+D", enabled: has }),
      item("Business Rules…", "project:rules", { accelerator: "Alt+CmdOrCtrl+R", enabled: has }),
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

  // Screen: actions on the selected screen (the same ones as in its ⋯ and right-click menu).
  const screen = {
    label: "Screen",
    submenu: [
      item("Fullscreen Preview", "screen:fullscreen", { accelerator: "Shift+CmdOrCtrl+F", enabled: has }),
      item("Reload Screen", "screen:reload", { enabled: has }),
      sep,
      item("Add Note", "screen:note", { accelerator: "Alt+CmdOrCtrl+N", enabled: has }),
      item("Description…", "screen:desc", { enabled: has }),
      item("Show Component Tree…", "screen:structure", { enabled: has }),
      item("Undo Screen Change", "screen:undo", { accelerator: "Alt+CmdOrCtrl+Z", enabled: has }),
      item("Redo Screen Change", "screen:redo", { accelerator: "Alt+Shift+CmdOrCtrl+Z", enabled: has }),
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
      sep,
      item("Element Inspector", "view:inspector", { enabled: has }),
      sep,
      { label: "Appearance", submenu: [
        item("Automatic", "view:theme:auto"), item("Light", "view:theme:light"), item("Dark", "view:theme:dark"),
        // glass panels (translucent, blurred) are a macOS look; the app handles the toggle itself because it keeps the choice
        ...(mac ? [sep, { label: "Glass Effect", type: "checkbox", checked: glass, click: act("view:glass") }] : []),
      ] },
      { label: "Offline Use", submenu: [
        { label: "Offline Mode", type: "checkbox", checked: offline, click: act("cdn:offline") },
        item("Warm Up CDN Cache", "cdn:warmup"), item("Clear CDN Cache", "cdn:clear"),
      ] },
      ...(mac ? [] : [{ role: "togglefullscreen" }]), // macOS adds its own Enter Full Screen item to the View menu
      ...(isDev ? [sep, { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }] : []),
    ],
  };

  const windowMenu = { label: "Window", submenu: [{ role: "minimize" }, ...(mac ? [{ role: "zoom" }, sep, { role: "front" }] : [{ role: "close" }])] };
  const help = { label: "Help", submenu: [item("Welcome Tour…", "app:tour"), sep, item("Claude Code & Plugins…", "claude:setup"), item("Check for Plugin Updates…", "plugins:check"), sep, item("Check for Updates…", "update:check"), ...(mac ? [] : [sep, item(`About ${appName}`, "app:about")])] };

  const appMenu = {
    label: appName,
    submenu: [
      item(`About ${appName}`, "app:about"), item("Check for Updates…", "update:check"), item("Claude Code & Plugins…", "claude:setup"), sep,
      { role: "services" }, sep, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, sep, { role: "quit" },
    ],
  };

  return [...(mac ? [appMenu] : []), file, edit, project, screen, chat, view, windowMenu, help];
}
