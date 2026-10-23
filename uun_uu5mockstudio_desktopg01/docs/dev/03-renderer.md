# 3. Renderer modules (`src/renderer`)

`index.html` holds the static markup (dialogs are hidden elements), `app.css` and `glass.css` the styles (`glass.css` overrides for the Glass Effect via `body[data-glass]`), `theme.js` runs before the first paint to avoid a flash.

`renderer.js` is the orchestrator: it creates the other modules, keeps the **chat entries**, the open project and the selection, handles menu actions (`onMenuAction`) and wires the keyboard. It is long on purpose: it is the one place where modules meet.

| File | Responsibility |
| --- | --- |
| `canvas.js` | `createCanvas`: frames (webviews), camera (zoom, pan), shields over unselected frames, device sizes (a popover menu instead of a native select, because the title bar is scaled with the zoom), notes pinned to frames, compact title bars at small zoom. |
| `chatdock.js` | The chat panel: docked or floating, drag and resize, the round bubble when minimized (own place, bottom-left by default), the separate context for the fullscreen preview. |
| `fsnote.js` | The notes of the screen open in fullscreen: the panel and the bubble (bottom-right by default, shows the count; without notes it adds one). |
| `inspector.js` | **Script injected into screens** (`INJECT`), `createInspector` (host side), `describePick`, `agentContext`, selection rules (`updateSelection`). See [06](06-inspector.md). |
| `propsPanel.js` | The inspector side panel: breadcrumb, controls per prop kind (`kindOf`), lists, JSON editor window, text and icon fields, **Show component tree**. |
| `actionListEditor.js`, `actionGrammar.js` | The window that edits a list of actions, and the grammar of an action (fields built from the documentation of `Uu5Elements.Button`). |
| `textField.js`, `iconField.js`, `iconPicker.js` | LSI-aware text field with a language switch; the icon field; the catalog dialog (uuGDS, uuBml, states). |
| `templatesDialog.js` | The Templates dialog: the sources with their counts, Open folder for my templates, the list of templates. |
| `dashboard.js` | The start view (`#dash`): prompt, idea chips, project cards with thumbnails; pure helpers `ago`, `projectNameFrom`. |
| `libraryPicker.js` | The dialog and, as the **Components** tab of the panel (`showInline` / `leaveInline`, the `#libview` node moves between the dialog and `#libpane`) "Components from the libraries": search, filter by library, description and a props table (long defaults clipped, click to expand). |
| `memory.js`, `rulesPanel.js`, `rulesDoc.js`, `projectDoc.js`, `descPanel.js` | Rules, notes and descriptions: the dialogs and the pure Markdown helpers (`parseRules`, `editItem`, `getScreenText`, …). Sections of the rules dialog can be rolled up; counts for **This project** and **All projects**. |
| `planTree.js` | Pure functions of the plan: normalize, extract (`extractPlan`: text, tree, questions; a drawn ASCII tree is parsed too), edit by path, `moveTo`, `layoutTree`, `dropTarget`, `describeEdits`, `approvalMessage`, `regenerateMessage`. |
| `planView.js`, `planDiagram.js` | The plan card (questions, outline, editor) and the interactive SVG/HTML diagram with zoom, collapse and drag and drop. |
| `structureDialog.js` | The component tree of a screen or of one component; logs the moves for the file; Regenerate. |
| `setup.js`, `tour.js` | First-run setup dialog; the welcome tour. |
| `markdown.js` | A small, safe Markdown subset for chat messages (everything is escaped first). |
| `icons.js` | Shared SVG icons. |

## Conventions

- **No framework.** DOM is built with small helpers (`el()`), state is plain objects, and most modules are `createX({ deps }) → { methods }`.
- **Pure logic is separated** (`planTree.js`, `rulesDoc.js`, `projectDoc.js`, `actionGrammar.js`, `propsPanel.kindOf`) and unit-tested; the DOM parts are checked by driving the app (see [11](11-testing.md)).
- **Persisted chat entries** are plain objects (`{kind: "user" | "ai" | "plan" | "steps" | "note" | "err", …}`); transient flags (`planning`, `full`) are stripped before saving (`chatSnapshot`).
- Modals are listed in `MODALS` (topmost first) so that **Esc** closes the right one; each modal also handles its own Escape and closes by the shared cross button (`.dlg-x`).
- **Accessibility**: controls have `aria-label`s; toggles use `aria-pressed` / `aria-checked`; keyboard alternatives exist for drag and drop (⌥ + arrows).
