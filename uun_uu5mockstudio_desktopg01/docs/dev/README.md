# uu5Mock Studio: technical documentation

For people who develop or maintain the app. It describes how the app is built and why, not every function: the code carries comments with the details.

1. [Architecture](01-architecture.md): processes, the preview, data flows, folders.
2. [Main process modules](02-main-process.md): what each file of `src/main` does.
3. [Renderer modules](03-renderer.md): what each file of `src/renderer` does.
4. [The agent](04-agent.md): how Claude Code is driven, the system prompt, permissions, the MCP server.
5. [Screen source: JSX analysis and editing](05-screen-source.md): the Babel layer behind the inspector, lists, structure and moves; undo.
6. [Inspector](06-inspector.md): the script injected into screens, picking, the panel, lists of actions.
7. [Plan mode and the component tree](07-plan-mode.md): formats, editing, diagram, regeneration.
8. [Files, state and formats](08-files-and-state.md): everything the app writes, with its format.
9. [IPC reference](09-ipc-reference.md): the channels between the renderer and the main process.
10. [Build and release](10-build-and-release.md), see also [RELEASING.md](../RELEASING.md) (Czech).
11. [Testing](11-testing.md): unit tests and driving the app through the DevTools protocol.
12. [Security and privacy](12-security.md).

## Where to start

```bash
cd uun_uu5mockstudio_desktopg01
npm install        # Node 22
npm start          # the app, with projects in ./projects
npm test           # unit tests (node:test)
```

The code is plain ES modules (no bundler, no framework): `src/main/*.mjs` (Node, Electron main), `src/main/preload.cjs`, `src/main/webviewPreload.cjs`, and `src/renderer/*.js` loaded by `index.html`. Reading order for a newcomer: `main.mjs` → `preload.cjs` → `renderer.js` → the module of the feature you work on.
