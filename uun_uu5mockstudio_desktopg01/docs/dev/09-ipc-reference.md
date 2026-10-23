# 9. IPC reference

The renderer calls `window.studio.<function>(…)` (`preload.cjs`), which does `ipcRenderer.invoke("<channel>", …)`. Handlers in `main.mjs` return the value, or `{ error: "message" }` when they fail. Events go the other way with `webContents.send(channel, payload)` and are subscribed with `on…` functions.

## Calls

### App, setup, updates

| Function (channel) | Arguments → result |
| --- | --- |
| `info` (`app:info`), `meta` (`app:meta`) | → app name, version, platform, update data |
| `claudeStatus` (`claude:status`) | `refresh?` → Claude Code and plugin status |
| `claudeLogin` / `claudeInstall` / `claudeInstallerInfo` / `claudeCancel` / `claudeInstallPlugins` | the setup steps (`claude:*`); progress arrives as `claude:progress` |
| `pluginsCheck` / `pluginsLater` / `pluginsUpdate` (`plugins:*`) | check updates (`force?`), postpone, update (`ids`) |
| `checkUpdates` / `installUpdate` / `selfInstallUpdate` / `updateLater` / `openUpdate` (`update:*`) | GitHub releases: check, open the installer, install by itself (macOS), postpone, open the page |
| `tourDone` (`tour:done`) | the welcome tour was shown |
| `openExternal` (`open:external`), `docsOpen` (`docs:open`) | open a URL in the browser (only allowed hosts) |

### Templates

| Function (channel) | Arguments → result |
| --- | --- |
| `templatesList` (`templates:list`) | → `{ templates, levels, sources }` |
| `templatesReveal` (`templates:reveal`) | opens the folder of my templates |
| `templatesApply(id)` (`templates:apply`) | copies the starter files into the open project → `{ written, skipped, screens }` |

### Projects and screens

| Function (channel) | Arguments → result |
| --- | --- |
| `listProjects`, `openProject(name)`, `createProject(name)`, `renameProject(from, to)`, `deleteProject(name)`, `closeProject`, `revealProject`, `projectThumb(name)` (`projects:thumb`, → data URL of the picture or null), `projectsFolder(op)` (`projects:*`, `project:reveal`) | project management; `projectsFolder` takes `"path"` (→ `{ path, locked }`), `"open"`, `"reset"` (back to the default, relaunches) or anything else to choose a folder (refused when `STUDIO_PROJECTS_DIR` fixes it) |
| `saveLayout(project, layout)` (`layout:save`) | canvas layout of a project |
| `registerView(file, id)` / `unregisterView(file)` (`view:*`) | register the webContents id of a screen's webview (for the agent tools) |
| `deleteScreen(file)` (`screen:delete`) → `{ ok, rules, description }`, `screenDeleteInfo(file)` (`screen:deleteInfo`) → `{ rules, description, notes }` | delete a screen with its notes, rules and description |
| `revealScreen(file)`, `reveal(path)` | show in the file manager |
| `setFullScreen(on)` (`window:fullscreen`), `setTheme(t)` (`theme:set`), `toggleGlass` (`glass:toggle`) | window and look |

### Chat and agent

| Function (channel) | Arguments → result |
| --- | --- |
| `send(prompt, model, { plan })` (`chat:send`) | starts a query; events arrive as `claude:event` |
| `stop` (`chat:stop`) | aborts the running query |
| `listChats`, `newChat`, `switchChat(id)`, `deleteChat(id)`, `saveChat(project, chatId, chat)` (`chat:*`) | conversations of the project |
| `saveAttachments(items)` (`attachments:save`) | `[{ id, name, mime, data (base64) }]` → paths under `.studio/attachments` |

### Memory

| Function (channel) | Arguments → result |
| --- | --- |
| `rulesGet`, `rulesSet(text)`, `rulesAdd(text, screen)` (`rules:*`) | `BUSINESS_RULES.md` |
| `rulesGetGlobal`, `rulesSetGlobal(text)`, `rulesAddGlobal(text)` | `GLOBAL_RULES.md` |
| `descGet`, `descSet(text)` (`desc:*`) | `PROJECT.md` |
| `notesGet(file)`, `notesSet(file, notes)`, `notesNewId(taken)` (`notes:*`) | notes of a screen |
| `repoLink`, `repoUnlink`, `repoFiles(q)`, `repoOpen`, `repoBranches`, `repoSetBranch(b)` (`repo:*`) | the linked git repository |

### Screen source (inspector, lists, structure, undo)

All take the **file name** of the screen; `ordinals` is the chain of ordinals (`[element, parent, …]`), `sub` is `{ prop, index, count }` for an item of a list.

| Function (channel) | Arguments → result |
| --- | --- |
| `jsxInspect(file, ordinals, sub)` (`jsx:inspect`) | → `{ element, chain, doc }` (props, documentation) |
| `jsxSet(file, ordinals, name, type, value, sub)`, `jsxRemove(file, ordinals, name, sub)`, `jsxSetBranch(…)`, `jsxSetText(file, ordinals, scope, lang, value)` | edit one prop, remove it, edit a conditional branch, edit one language of a text; each returns the fresh description |
| `jsxList(file, ordinals, prop)`, `jsxItem(file, ordinals, prop, op)` | read a list; `op` is `{ type: "add" \| "remove" \| "move" \| "duplicate" \| "replace", … }` |
| `jsxStructure(file, ordinal?)` | → the structure tree of the screen (or of the part under `ordinal`), or `null` |
| `jsxMoves(file, ops)` | → `{ applied: [index], failed: [{ index, reason }], structure }` |
| `screenUndo(file?)`, `screenRedo(file?)`, `screenHistory(file)` | step through the history; `file` may be `null` (the latest step of the project) → `{ ok, label, file, undo, redo }` |

### Documentation, icons, export, CDN

| Function (channel) | Arguments → result |
| --- | --- |
| `docsSearch(query, library)`, `docsLibraries`, `docsDetail(name)`, `docsDescribe(names)` (`docs:*`) | the component documentation of the `uu5-development` plugin |
| `iconCatalog` (`icons:catalog`), `uuBml` (`icons:bml`) | icon catalogs |
| `exportHtml(file)`, `exportImage(file, format)`, `exportZip`, `shareMail(kind, file)`, `dragPrepare(kind, file)`, `dragStart(path)` | export, share, native drag of a prepared file |
| `cdnStatus`, `cdnSetOffline(v)`, `cdnClear`, `cdnWarmup` (`cdn:*`) | the CDN cache; progress arrives as `cdn:progress` |

## Events (main → renderer)

| Subscribe | Channel | Payload |
| --- | --- | --- |
| `onEvent` | `claude:event` | a message of the Agent SDK, or `{ type: "stopped" }`, `{ type: "app_error", message }` |
| `onPreviewChanged` | `preview:changed` | `{ project, screens, changed: [file] }` (the watcher) |
| `onNavigated` | `preview:navigated` | file name (the agent opened a screen) |
| `onMemoryChanged` | `memory:changed` | `{ project, kind: "rules" \| "project" \| "notes" \| "global", … }` |
| `onMenu` | `menu:action` | action id of a menu item |
| `onClaudeProgress`, `onCdnProgress`, `onUpdate`, `onGlass` | `claude:progress`, `cdn:progress`, `update:event`, `glass:set` | progress and state |

For the exact signatures read `src/main/preload.cjs` (one line per function) and the handler of the same channel in `main.mjs`.
