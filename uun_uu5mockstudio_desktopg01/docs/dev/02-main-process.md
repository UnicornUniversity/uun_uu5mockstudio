# 2. Main process modules (`src/main`)

| File | Responsibility |
| --- | --- |
| `thumbs.mjs` | Dashboard pictures: the whole canvas (`compositionHtml`: every screen as an iframe at its saved place, scaled to fit) painted in a hidden window by `main.mjs`, cached in `.studio/thumb.jpg` with a signature in `thumb.json`, one at a time. |
| `main.mjs` | Entry point. App state (`app-state.json`), projects root, the static server, the session of the open project, **all IPC handlers**, the file watchers (open project; `GLOBAL_RULES.md`), window and fullscreen, drag of files, theme, glass. Handlers return `{ error }` instead of throwing (`guard`). |
| `preload.cjs` | `window.studio`: one function per IPC channel plus event subscriptions, via `contextBridge`. |
| `webviewPreload.cjs` | Preload of every screen `<webview>`: forwards pinch/wheel and ⌘⇧F to the host, receives the pan mode. |
| `menu.mjs` | The native menu template (`buildMenuTemplate`); items send an action id to the renderer (`menu:action`), which executes it. Testable without Electron. |
| `claudeService.mjs` | `ClaudeService`: one Agent SDK `query()` per message, the system prompt (`studioPrompt`, `memoryPrompt`, `planPrompt`), tool permissions (`toolVerdict`, `disallowedTools`). See [04](04-agent.md). |
| `studioBrowserMcp.mjs` | In-process MCP server `studio-browser`: tools the agent uses to look at the preview (`browser_open`, `browser_reload`, `browser_console`, `browser_snapshot`, `browser_click`, `browser_screenshot`) and `screen_structure`. |
| `mockClick.mjs` | Real mouse click on an element found by text or selector, for `browser_click`. |
| `screenshot.mjs`, `capture.mjs` | Capture of a webview (with a fallback when it is not painted) for the agent and for **Export → Image** (PNG / JPEG / PDF by the chosen extension). |
| `mockServer.mjs` | Static server for the projects folder with in-memory routes and `transformHtml`. |
| `cdnCache.mjs`, `warmup.mjs` | Cache for the Plus4U CDN (network-first or cache-first by URL, offline mode) and the warm-up pages. |
| `jsxSource.mjs` | Babel-based reading and editing of the JSX of a screen: ordinals, props, lists, texts, structure, moves. See [05](05-screen-source.md). |
| `screenHistory.mjs` | Undo / redo steps of the changes the app makes to a screen file. |
| `rules.mjs` | Business rules, global rules, notes, descriptions: reading, appending, parsing; what a deleted screen takes with it. |
| `projects.mjs`, `paths.mjs`, `chats.mjs` | Projects (folders, names, per-project `state.json`), where the projects live, the conversations of a project (several chats, titles, Claude session ids). |
| `repo.mjs` | The linked git repository: validation, files, branches, a read-only snapshot of a branch, **`accessPolicy`** (what the agent may read or write), secret paths. |
| `attachments.mjs` | Images attached to a message: file type by magic bytes, saved under `.studio/attachments`. |
| `uu5Docs.mjs` | Index of the documentation (wiki) of the `uu5-development` plugin: components, props, enums; search, detail, descriptions for prompts. |
| `uuGdsIcons.mjs`, `uuBml.mjs` | Catalogs of uuGDS and uuBml icons (the latter loaded from the network and cached). |
| `exporter.mjs`, `mailDraft.mjs` | HTML / ZIP export (with a tiny server script, since uu5 pages need `http://`), and `.eml` drafts for sharing outside macOS. |
| `claudeEnv.mjs`, `prerequisites.mjs`, `pluginUpdates.mjs` | Finding the Claude Code binary and its environment; the checks of the setup dialog (Claude Code, sign-in, plugins); the schedule of plugin update checks. |
| `githubUpdates.mjs`, `selfUpdate.mjs`, `updater.mjs` | Checking GitHub releases; self-installing an update on macOS (download, verify size and SHA-256, check the unpacked app, a script swaps the bundle after quit); `electron-updater` for builds with a feed. |
