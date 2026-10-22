# 11. Testing

## Unit tests

```bash
npm test
```

runs `node --test "test/*.test.mjs"` (Node's built-in runner, no framework). Tests are plain ES modules that import the modules under `src/` directly, so the logic must stay free of Electron imports where it should be testable. `test/helpers.mjs` has `tmp()` (a fresh temp folder) and `makeProject()` (a project folder with `.studio/state.json`).

| Area | Test files |
| --- | --- |
| Screen source (ordinals, props, lists, structure, moves) | `jsxSource`, `actionGrammar`, `propsPanelKinds`, `screenHistory`, `inspectorInject` |
| Plan mode | `planTree` (extraction, ASCII fallback, edits, `moveTo`, layout, `dropTarget`, approval texts) |
| Project memory | `rules`, `rulesDoc`, `projectDoc`, `memoryPrompt`, `chats`, `attachments`, `projects`, `paths` |
| Agent and environment | `claudeEnv`, `prerequisites`, `uu5Docs`, `uuBml`, `uuGdsIcons`, `repo` (incl. `accessPolicy`) |
| Preview, export, share | `mockServer`, `cdnCache`, `exporter`, `screenshot`, `mailDraft`, `markdown` |
| Updates and release | `githubUpdates`, `selfUpdate`, `githubPublish` |
| App wiring | `menu`, `rendererWiring` (checks that renderer modules, `index.html` ids and IPC functions agree) |

New pure logic gets a test next to the existing ones; `rendererWiring` catches a renamed element id or a missing preload function.

## Running the real app in isolation

UI behaviour is verified by starting a **separate Electron instance** with its own profile and projects so the user's data is never touched:

- `STUDIO_PROJECTS_DIR=<temp>`, `STUDIO_NO_TOUR=1`, and a separate `--user-data-dir`;
- remote debugging (`--remote-debugging-port=<port>`) and a script from `scripts/` (`cdp-eval.mjs`, `cdp-ui.mjs`, `cdp-gestures.mjs`, `cdp-inspect*.mjs`, …) drives the page over CDP: evaluate code, click, take screenshots, dispatch mouse events for drag and drop;
- the plan card can be fed without the agent through the `__plan` hook in test mode (also captures what would be sent);
- `scripts/e2e-chat.mjs` and `scripts/spike-*.mjs` exercise the agent for real and **cost tokens**: run them only deliberately.

Kill stale instances (`pkill -f Electron`) between runs; an old instance can answer on the same port and give misleading results.

## Manual checklist before a release

Light, dark and Glass looks; first start without a project; open, create, rename and delete a project; a screen appears and updates while the agent works; Plan → answer questions → Build; inspector (pick, edit, undo/redo, list editor); component tree drag and drop with Keep / Undo; rules, notes and description dialogs; export and share; update check; the packaged app starts and finds Claude Code.
