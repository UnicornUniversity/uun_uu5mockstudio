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
| `helpDocs` (`help:docs`) | `[{ file, text }]`: the Markdown files of `docs/user` (from `app.getAppPath()`; packed by `files` in `electron-builder.config.cjs`) |
| `openExternal` (`open:external`), `docsOpen` (`docs:open`) | open a URL in the browser (only allowed hosts) |

### Templates

| Function (channel) | Arguments → result |
| --- | --- |
| `templatesList` (`templates:list`) | → `{ templates, levels, sources }` |
| `templatesReveal` (`templates:reveal`) | opens the folder of my templates |
| `templatesApply(id)` (`templates:apply`) | copies the starter files into the open project → `{ written, skipped, screens }` |
| `projectSetKind({ level, scope })` (`project:setKind`) | stores what the open project was started as (`state.kind`; `scope` only for the levels `web` / `page`) → `{ level, scope }`; the project payload then carries `level` and `scope` |

### Projects and screens

| Function (channel) | Arguments → result |
| --- | --- |
| `listProjects`, `openProject(name)`, `createProject(name)`, `renameProject(from, to)`, `deleteProject(name)`, `closeProject`, `revealProject`, `projectThumb(name)` (`projects:thumb`, → data URL of the picture or null), `projectsFolder(op)` (`projects:*`, `project:reveal`) | project management; `projectsFolder` takes `"path"` (→ `{ path, locked }`), `"open"`, `"reset"` (back to the default, relaunches) or anything else to choose a folder (refused when `STUDIO_PROJECTS_DIR` fixes it) |
| `saveLayout(project, layout)` (`layout:save`) | canvas layout of a project |
| `registerView(file, id)` / `unregisterView(file)` (`view:*`) | register the webContents id of a screen's webview (for the agent tools) |
| `deleteScreen(file)` (`screen:delete`) → `{ ok, rules, description, sitemap }`, `screenDeleteInfo(file)` (`screen:deleteInfo`) → `{ rules, description, notes, sitemap }` | delete a screen with its notes, rules, description and its pages in the sitemap (`forgetScreenInSitemap`: `dropScreen` removes the nodes, sub-pages take their place, the root only loses `file`; written with `backup`) |
| `copyScreen(file)` (`screen:copy`) → `{ ok, file, media, rules, notes, description }`, `pasteScreen()` (`screen:paste`) → result of `pasteScreen` or `{ none }`, `copyScreenTo(file, project)` (`screen:copyTo`) → the same with `project` | copy / paste a screen with its media, notes, rules and description (`screenClip.mjs`): the clipboard gets the HTML, main keeps the whole bundle while that text is on the clipboard |
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
| `docsSearch(query, library)`, `docsLibraries`, `docsDetail(name)`, `docsDescribe(names)` (`docs:*`) | the component documentation of the `uu5-development` and `uu5bricks` plugins |
| `docStructure(url, { login })` (`docs:structure`) | the structure of the pages behind a link, to pick the pages of a sitemap from: `{ ok, kind, title, tree }` or `{ error: "login" \| "territory" \| "npx" \| message }`; read-only, nothing is saved |
| `docWebLogin(url)` (`docs:webLogin`) | opens an https page in a window of the preview session so the user can sign in; resolves when the window is closed (the structure of the site is then read with that sign-in) |
| `iconCatalog` (`icons:catalog`), `uuBml` (`icons:bml`) | icon catalogs |
| `exportHtml(file)`, `exportImage(file, format)`, `iconsMdi()` (the MDI catalog), `exportText(name, text)`, `copyText(text)`, `copyOut(kind, file)` (Copy of the Share menu: `png` image, `html` source, `zip` file), `exportZip`, `shareMail(kind, file)`, `dragPrepare(kind, file)`, `dragStart(path)` | export, share, native drag of a prepared file |
| `cdnStatus`, `cdnSetOffline(v)`, `cdnClear`, `cdnWarmup` (`cdn:*`) | the CDN cache; progress arrives as `cdn:progress` |

### Existing components and handoff

See [15](15-existing-components.md). `screen` is the file name of a screen; without it the only baseline is used.

| Function (channel) | Arguments → result |
| --- | --- |
| `repoRecent`, `repoPick`, `repoFilesAt(path, q)` (`repo:*`) | a repository before a project exists (the dashboard's Start from an existing component) |
| `componentStart(file, { mode, name?, description? })` (`component:start`) | reads the component, saves the baseline (`mode: "extend"`) or reference (`"new"`) plan → `{ mode, name, screen, plan, files, nodes, brief }` |
| `componentOrigin()` | `{ kind: "baseline", components: [{ name, file, plan, screens }] }`, `{ kind: "reference", name, ref, file, plan }` or `null` |
| `componentBaseline(screen)`, `componentFocus(screen)` | the baseline of a screen `{ slug, file, name, tree }`; the root names its component tree starts at |
| `componentReread(screen)` | reads the screen's component again into its plan → `{ slug, file, name, tree, files, nodes }` |
| `componentUpdate(screen)` | Update from code → `{ upToDate: true, file, name }` or `{ slug, file, name, brief, changes, libs, additions, known }` |
| `componentSynced(slug)` | the agent has done the update: the new reading becomes the starting point, one undo step → `{ ok, file }` |
| `componentExceptions(files)` | `[{ file, origin, lines }]`: library components that differ from the code |
| `handoffInfo(planSlug, only)`, `handoffCreate({ planSlug, branch, base, only })` (`handoff:*`) | the dialog's data; makes the package and the branch (`planSlug` may be `@screens` or `@redesign:<slug>`) |
| `handoffSaveSpec(planSlug, name, spec)` | the choice and fields of one component (into the plan's tree or `.studio/links.json`) |
| `handoffFetch`, `handoffBaseStatus(base)`, `handoffBranchInfo(branch)` | the base branch: fetch, behind its remote, an existing handoff branch |
| `handoffWorkspace(branch, slug, prompt)`, `handoffWorkingCopy(branch, prompt)`, `handoffSwitch(branch, prompt)` | where to work: a worktree next to the repository, the state of the working copy, switching it to the branch; each with the `claude` / `codex` commands |
| `handoffTools()` | the tools found on this computer `{ vscode, vscodeClaude, vscodeCodex, claudeApp, codexApp, claudeCli, codexCli, tabs }` |
| `handoffOpenEditor(folder)`, `handoffReveal(folder)` | open the folder in VS Code / the file manager |

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

## Plans (`plans/*.md`)

`plans:list` → `[{ slug, title, status, created, mtime }]`; `plans:read(slug)` → `{ slug, text, meta, body, title, status }`; `plans:write(slug, text)` (whole text of an existing plan); `plans:status(slug, status)`; `plans:save({ slug?, title, markdown, status? })` → `{ slug, created }` (a new plan, or a new version of `slug`; `created` is kept); `plans:remove(slug)` (to the trash). Event `plans:changed` `{ project, plans }` (a watch on `<project>/plans`, started also when the folder appears later).

## Sitemap (`sitemap.json`)

`sitemap:read` → `{ sitemap, hasPrev }` (`sitemap` is null without a valid file); `sitemap:write(sitemap, { backup? })` → `{ sitemap, hasPrev }` (normalized; `backup` keeps the file it replaces); `sitemap:restore` → the result of taking the last replacement back, or `{ error }`. Event `sitemap:changed` `{ project, sitemap, hasPrev }` (the watch of the project folder).
