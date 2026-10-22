# 1. Architecture

```
┌────────────────────────────── Electron main (Node) ──────────────────────────────┐
│ main.mjs: windows, menu, IPC, projects, file watcher, Claude session per project │
│   claudeService (Agent SDK query)  ←→  studio-browser MCP server (in process)    │
│   mockServer (static, 127.0.0.1:<port>)   cdnCache   selfUpdate   exporter       │
└───────────────▲───────────────────────────────────────────────▲──────────────────┘
        IPC (preload.cjs: window.studio)                       │ http://127.0.0.1:<port>/<project>/<screen>.html
┌───────────────┴──────────────── renderer (index.html) ───────┴──────────────────┐
│ renderer.js orchestrates: chat, canvas (canvas.js), inspector panel, dialogs      │
│   one <webview> per screen (preload: webviewPreload.cjs) = the real uu5 page      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## Processes

- **Main process** (`src/main/main.mjs`): creates the window, builds the menu (`menu.mjs`), registers every IPC handler, owns the projects folder and the file watcher, runs the Claude session of the open project and the static server. Handlers are wrapped by `guard()` so an exception becomes `{ error }` for the renderer.
- **Preload** (`preload.cjs`): exposes `window.studio` to the renderer with `contextBridge`: every function is a thin `invoke("channel", args)` or an event subscription. No Node API is exposed.
- **Renderer** (`index.html` + modules): the whole UI. `renderer.js` wires the modules together; the modules take their collaborators as arguments (`createCanvas({…})`, `createPropsPanel({ api, … })`), so most of them can be tested without a DOM.
- **Webviews**: every screen is shown in an Electron `<webview>` that loads `http://127.0.0.1:<port>/<project>/<screen>.html`. Their preload `webviewPreload.cjs` forwards pinch and wheel gestures and the fullscreen shortcut to the host and receives the pan mode.

## The preview server

`mockServer.mjs` serves the whole projects folder (`/<project>/<screen>.html`) and a few in-memory routes (the CDN warm-up pages). `transformHtml` is `tagHtml` from `jsxSource.mjs`: it adds a `data-uu5-src="<ordinal>"` attribute to every uu5 component of the JSX in the copy that goes to the preview, so the inspector can map a running React fiber back to its JSX element. **The files on disk stay untouched.** A file watcher (`fs.watch`) tells the renderer which screens changed, and the frames reload.

`cdnCache.mjs` sits in front of the Plus4U CDN requests of the webviews (`session.defaultSession.protocol.handle("https", …)` in `main.mjs`): immutable versioned files prefer the cache, floating files and non-GET requests prefer the network; **offline mode** serves only from the cache; `warmup.mjs` defines pages that load the common libraries once.

## Data flows worth knowing

1. **Chat message** → renderer builds the text (chips, context of the fullscreen screen, attachments) → `chat:send` → `ClaudeService.send` → SDK events stream to the renderer (`onEvent`) → entries in the chat; the agent writes files → the watcher reloads frames.
2. **Inspector pick** → script inside the page logs a marker line → the webview `console-message` event → `inspector.handleConsole` → `showPick` → `propsPanel.show` → `jsx:inspect` (the main process parses the file) → controls; an edit calls `jsx:set` etc., which writes the file (and records an undo step) → the watcher reloads the frame.
3. **Plan** → `chat:send` with `{ plan: true }` → prompt + removed file tools → answer text → `extractPlan` → a plan entry (questions, tree) → edits in the renderer only → **Build** sends the approval message with the edited tree and answers.
4. **Undo** → main keeps `before/after` texts per file (`screenHistory`) → `screen:undo` writes the old text back.

## Folders

| Folder | Content |
| --- | --- |
| `src/main` | main-process modules (see [02](02-main-process.md)) |
| `src/renderer` | renderer modules, `index.html`, `app.css`, `glass.css`, `assets/` |
| `test` | unit tests (`node:test`) |
| `scripts` | CDP drivers, the demo recorder (`scripts/demo`), the GitHub publisher (`scripts/publish-github.mjs`, `scripts/lib`) |
| `build` | icon sources, `adhocSign.cjs`, entitlements |
| `docs` | this documentation, release notes, `RELEASING.md`, `DEMO.md` |
| `projects` | the projects of a development run (not packaged) |
