# 8. Files, state and formats

## On disk

| Path | Written by | Format |
| --- | --- | --- |
| `<projects>/<project>/<screen>.html` | the agent; the inspector, the list editor and the component tree (small edits) | HTML with one or more `<script type="text/babel">` blocks |
| `<project>/BUSINESS_RULES.md` | the agent, the rules dialog | Markdown, see below |
| `<projects>/GLOBAL_RULES.md` | the agent (only when told a rule holds always), the rules dialog | the same, with `G-nnn` ids |
| `<project>/PROJECT.md` | the description dialogs | `# Project description`, text, `## Screen: <name>` blocks |
| `<project>/<screen>.notes.md` | the notes | `# Notes: <screen>`, then `<!-- note <id> -->` + text per note |
| `<project>/.studio/state.json` | main | `{ chats: [{ id, title, createdAt, updatedAt, sessionId, entries }], currentChatId, layout: { frames } }` |
| `<project>/.studio/thumb.jpg` | main (`thumbs.mjs`) | picture of the whole canvas for the dashboard (`thumb.json` holds the signature of screens + layout), redone when either changes |
| `<project>/.studio/template/` | main (`templates.mjs`) | `template.json` + `TEMPLATE.md` of the template the project was started from (read by the agent) |
| `<project>/.studio/attachments/` | main | images attached to messages (read by the agent, never edited) |
| `<project>/.studio/removed-screen-memory.md` | main | rules and descriptions removed with a deleted screen (a log, by date) |
| `<userData>/app-state.json` | main | `lastProject` (remembered but unused: the app always starts on the dashboard), `projectsRoot` (the chosen projects folder), `offline` (CDN mode), `glass`, `tourSeen`, `updateCheckedAt` / `updateLater` (app updates), `pluginsCheckedAt` / `pluginsLater` / `pluginUpdates` (plugin updates) |
| `<userData>/uubml.json` | main | cache of the uuBml catalog |

`<projects>` is **Documents/uu5Mock Studio** in a packaged app and `./projects` in a development run; a folder chosen in **Project → Projects Folder** wins, and `STUDIO_PROJECTS_DIR` beats everything (used by tests).

The Markdown files are **the single source of truth**: the app rewrites exactly the lines it changes (`rulesDoc.editItem`, `projectDoc.setScreenText`) so everything people or the agent wrote by hand survives.

### `BUSINESS_RULES.md`

```markdown
# Business rules

## General
- R-001 a thesis always belongs to one study
- R-003 (assumed) the topic may change during the work, then it passes the approval again

## Screen: thesis-detail
- R-010 (screen: thesis-detail) the work is a workflow Assignment → Approval → …
```

An item is `- R-nnn [(screen: name)] text`; the next id is the highest plus one (`nextRuleId`); a rule of a screen goes under `## Screen: <name>`. `(assumed)` marks rules the agent inferred. The rendered view of the dialog (`parseRules`) classifies lines as `h1`, `h2`, `item`, `text`, `blank`, `code`.

## In the renderer

- **Chat entries** are saved in `state.json`: `{ kind: "user", text, images? }`, `{ kind: "ai", text }`, `{ kind: "steps", steps }`, `{ kind: "note" | "err", text }`, `{ kind: "usage", in, out, cacheRead, cacheWrite, models, cum, ctx, sofar? }` (tokens of one request, `cum` the cumulative counters, `ctx` the context size; see `usage.js`), `{ kind: "plan", text, tree, questions, answers, original, state, mode, sel, … }`. Transient flags are not saved (`planning`, `full`).
- **localStorage** (view preferences only; nothing the user would miss): `uu5studio.planMode`, `uu5studio.chat` / `uu5studio.chatfs` (chat dock geometry and state, normal and fullscreen), `uu5studio.fsnote2` (notes panel in fullscreen), `uu5studio.selbarPos` (bar over a screen), `uu5studio.rulesMode`, `uu5studio.rulesScope`, `uu5studio.rulesCollapsed` (rolled up sections), `uu5studio.defaultModel`, theme keys.
- **Canvas layout** (positions and sizes of frames, device per frame, camera) is saved per project with `layout:save` into `state.json`.

## Screens and the preview

The agent writes the screens; the preview gets a **copy with `data-uu5-src` attributes** from the server (`tagHtml`). Exports (`export:html`, ZIP) use the files as they are on disk.
