# 3. Renderer modules (`src/renderer`)

`index.html` holds the static markup (dialogs are hidden elements), `app.css` and `glass.css` the styles (`glass.css` overrides for the Glass Effect via `body[data-glass]`: a small set of material tokens on `:root` for light and dark, `--glass-sidebar` / `--glass-thin` / `--glass-regular` / `--glass-thick` with their blur, rim, highlight, shadow and scrim tokens, used by every surface instead of ad-hoc colours; `prefers-reduced-transparency` makes them solid; window vibrancy is deliberately not used, because Chromium leaves stale frames in the translucent areas of a clear window), `theme.js` runs before the first paint to avoid a flash.

`renderer.js` is the orchestrator: it creates the other modules, keeps the **chat entries**, the open project and the selection, handles menu actions (`onMenuAction`) and wires the keyboard. It is long on purpose: it is the one place where modules meet.

| File | Responsibility |
| --- | --- |
| `canvas.js` | (see also `reloadSoft`: a screen that changed is loaded in a **second webview under the shown one**; when it has settled, scroll restored, the two are swapped, the new webcontents id is registered (`onReady`), the inspector is injected (`onPageReady`) and `onViewSwapped` lets the renderer attach its console listener. Exact at every zoom, unlike a picture.) |
| `canvas.js` | `createCanvas`: frames (webviews), camera (zoom, pan), shields over unselected frames, device sizes (a popover menu instead of a native select, because the title bar is scaled with the zoom), notes pinned to frames, compact title bars at small zoom. |
| `chatdock.js` | The chat panel: docked or floating, drag and resize, the round bubble when minimized (own place, bottom-left by default), the separate context for the fullscreen preview. |
| `fsnote.js` | The notes of the screen open in fullscreen: the panel and the bubble (bottom-right by default, shows the count; without notes it adds one). |
| `inspector.js` | **Script injected into screens** (`INJECT`), `createInspector` (host side), `describePick`, `agentContext`, selection rules (`updateSelection`). See [06](06-inspector.md). |
| `propsPanel.js` | The inspector side panel: breadcrumb, controls per prop kind (`kindOf`), lists, JSON editor window, text and icon fields, **Show component tree**. |
| `actionListEditor.js`, `actionGrammar.js` | The window that edits a list of actions, and the grammar of an action (fields built from the documentation of `Uu5Elements.Button`). |
| `textField.js`, `iconField.js`, `iconPicker.js` | LSI-aware text field with a language switch; the icon field; the catalog dialog (uuGDS, uuBml, states). |
| `freeze.js` | No flicker when a screen renders again. `waitSettled(view)`: waits until a page has content that stopped changing. `attachFreeze(view, host)`: while the webview loads (a reload not made by the canvas: the agent's checks, Present), a picture of the last good render covers it. |
| `templatesDialog.js` | The Templates dialog: the sources with their counts, Open folder for my templates, the list of templates. |
| `dashboard.js` | The start view (`#dash`): prompt, idea chips, project cards with thumbnails; pure helpers `ago`, `projectNameFrom`. |
| `libraryPicker.js` | The dialog and, as the **Components** tab of the panel (`showInline` / `leaveInline`, the `#libview` node moves between the dialog and `#libpane`) "Components from the libraries": search, filter by library, description and a props table (long defaults clipped, click to expand). |
| `memory.js`, `rulesPanel.js`, `rulesDoc.js`, `projectDoc.js`, `descPanel.js` | Rules, notes and descriptions: the dialogs and the pure Markdown helpers (`parseRules`, `editItem`, `getScreenText`, …). Sections of the rules dialog can be rolled up; counts for **This project** and **All projects**. |
| `planTree.js` | Pure functions of the plan: normalize, extract (`extractPlan`: text, tree, questions; a drawn ASCII tree is parsed too), edit by path, `moveTo`, `layoutTree`, `dropTarget`, `describeEdits`, `approvalMessage`, `regenerateMessage`. |
| `planView.js`, `planDiagram.js` | The plan card (questions, outline, editor) and the interactive SVG/HTML diagram with zoom, collapse and drag and drop. |
| `structureDialog.js` | The component tree of a screen or of one component; logs the moves for the file; Regenerate. |
| `setup.js`, `tour.js` | First-run setup dialog; the welcome tour. |
| `planView.js` (`renderTree`) | The tree section (diagram / outline switch, detail on click) is `renderTree(entry, ctx, opts)`, used by the chat card and by the plan card on the canvas. |
| `sitemap.js`, `sitemapView.js` | The sitemap of a portal (pure model and edits by path; the map with the page editor). |
| `siteStructure.js`, `sitePicker.js` | Sitemap from a link: the structure of a web site, a uuBookKit book or a uuManagementKit document as a tree to pick from (pure), and the dialog with the ticks. |
| `planCards.js`, `planDoc.js` | The plans of the project as cards in `#world` (view / edit mode, drag, resize, Approve & build; layout in `state.layout.plans`, included in the fit through the canvas option `getExtraRects`); front matter, slug and status helpers shared with the main process. |
| `markdown.js` | A small, safe Markdown subset for chat messages (everything is escaped first); `markdownDoc` is the richer one for plan cards (h1–h4, nested lists, checklists, tables, quotes, `[[screen.html]]` links). |
| `icons.js` | Shared SVG icons. |
| `uu5StringCollect.js`, `uu5String.js`, `mdiBaseline.js` | Copy as uu5String: the tree collected from the rendered screen and its serialization, see [14](14-uu5string.md). |

## Roles

`src/renderer/role.js` is the only table of roles (preset level, Plan, Eco, Share format, simple view, the sentence for the agent); it is plain data, also imported by the main process and tested in `test/role.test.mjs`. The role is kept in `app-state.json` (`role`, `roleAsked`) and returned by `app:meta`; `role:set` / `role:skip` write it. `applyRole()` in `renderer.js` writes the presets into the usual localStorage keys once, so later manual choices simply stay (no list of overrides). The simple view is the `body.simple` class, switched by the `.viewtog` ("Advanced") button of the top bar and of the dashboard (`setView`; what it hides is the `body.simple` block at the end of `app.css` plus the context menu in `showContextMenu`; the simple view shows the model as `.modelnow` text, see `syncModelNow`, localStorage `uu5studio.view`); a role only presets it; `roleDialog.js` is the dialog, opened before the tour on the first run and from Help → Your Role…. `chat:send` puts `svc.role` on the service and `agentInstructions` appends `rolePrompt(role)`.

## Guide, comments, flow, variants

- `guide.js` (pure: the types, `buildGuidePrompt`) and `guideDialog.js`: "Guide me…" on the dashboard; the result is put into the message field with `dashboard.fill(text, templateId)`.
- `main/comments.mjs` (files `<screen>.comments.json`, `changeComments`), `commentsPanel.js` (the dialog, the toolbar badge, "Comment on this" in `propsPanel`); `main/handoff.mjs` assembles the specification (`gatherHandoff` + the pure `buildHandoff`); IPC `export:handoff`, `comments:*`.
- `main/flow.mjs` (`findFlowEdges`: which screen names which file as a string) and `flowLayer.js`: an SVG in the canvas world, drawn from `canvas.rects()`; refreshed on `preview:changed` and when a project opens.
- `variants.js` (pure `buildVariantsPrompt`) and `variantsDialog.js`: "Screen → Variants…" sends one request to the agent.

## Conventions

- **No framework.** DOM is built with small helpers (`el()`), state is plain objects, and most modules are `createX({ deps }) → { methods }`.
- **Pure logic is separated** (`planTree.js`, `rulesDoc.js`, `projectDoc.js`, `actionGrammar.js`, `propsPanel.kindOf`) and unit-tested; the DOM parts are checked by driving the app (see [11](11-testing.md)).
- **Persisted chat entries** are plain objects (`{kind: "user" | "ai" | "plan" | "steps" | "note" | "err", …}`); transient flags (`planning`, `full`) are stripped before saving (`chatSnapshot`).
- Modals are listed in `MODALS` (topmost first) so that **Esc** closes the right one; each modal also handles its own Escape and closes by the shared cross button (`.dlg-x`).
- **Accessibility**: controls have `aria-label`s; toggles use `aria-pressed` / `aria-checked`; keyboard alternatives exist for drag and drop (⌥ + arrows).
