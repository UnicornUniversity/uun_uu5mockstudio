# 13. Templates for new projects

The dashboard offers **templates** on five levels, after the uu5 / uuAppFramework vocabulary: **Application** (uu5Uve: a shell with navigation and several routes), **Route** (uu5Route: one screen with a route layout), **Component** (form, list, detail, dashboard…) and **Page** (a content page for a document, see below). A template is a starting point for the agent, not a finished screen.

## Format

A template is a folder:

```
<id>/
  template.json     manifest
  TEMPLATE.md       instructions for the agent
  start.html …      starter file(s); an Application template has several (one per route)
```

`template.json`:

| Key | Meaning |
| --- | --- |
| `id` | kebab-case (`a-z`, `0-9`, `-`, ≤ 64 characters); the key by which sources override each other. Default: the folder name. |
| `title`, `description` | shown on the chip, in its tooltip and in the Templates dialog |
| `level` | `app`, `route`, `component`, `web` or `page` (shown as **Web** and **Document**) |
| `kind` | optional: `form`, `list`, `detail`, `dashboard`… (chooses the icon) |
| `icon` | optional icon key (`app`, `route`, `form`, `list`, `detail`, `dashboard`, `page`, `portal`, `landing`, `home`, `product`, `article`, `report`) |
| `prompt` | the sentence put into the message field when the template is chosen |
| `order` | sort order inside a level (default 50) |
| `files` | optional list of starter files (default: every `*.html` in the folder) |
| `tags` | optional |

`parseTemplate` (in `src/main/templates.mjs`) refuses a template with a bad id or level, a missing title, no starter file, an unsafe file name (only `[\w][\w.-]*.html`, no paths), a file that is not a plain file (symbolic links are refused), a file over 512 KB or more than 24 files. A refused template is listed with its reason in the Templates dialog and otherwise ignored.

## Sources

Later sources win over earlier ones by `id`:

1. **Built-in**: `src/main/templates/builtin/` (shipped with the app: `app-basic`, `route-basic`, `form`, `list`, `detail`, `dashboard` and the Web pages `web-home`, `web-landing`, `web-page`, `web-product` and the Documents `page-portal`, `page-news`), written by hand after the uu5-mockup conventions (simulated Top, `RouteHeader`, `ActionGroup`, Drawer navigation).
2. **Plugins**: `templates/<id>/template.json` inside any installed Claude Code plugin (found through `~/.claude/plugins/installed_plugins.json`), and the bare skeletons of the `uu5-mockup` skill `create-mockup` as components (`legacy`; they are hidden where a template of the same level and kind exists).
3. **My templates**: `<userData>/templates/mine/` (the **Open folder** button of the Templates dialog opens it).

## My templates from screens

**Screen → Save as Template…** (and **Save a screen as template…** in the Templates dialog) makes a template of my own from screens of the open project (`templateSaveDialog.js`, IPC `templates:draft` / `templates:save`):

- `templates:draft(files)` gives the defaults: the title from the `<title>` of the first screen, the id (`slugify`), the level (`guessLevel`: several screens → app, Bricks only → page, a `RouteHeader` → route, else component), the screens of the project, the ids taken, whether the project has business rules and how many notes the screens have, and the files of the project the screens refer to (`src` / `href` that is not a web address): they do not go into the template, the dialog says so.
- `templates:save` writes the folder with `saveTemplate` (the checks of `parseTemplate`; an existing id only after **Replace**). The screens are copied as they are (the source markers of the inspector are added only when a screen is served, they are not in the file). `TEMPLATE.md` is written by `buildInstructions`: the author's instructions, then the business rules of the project and the notes of the screens (both can be left out), and where the template was made from (`createdFrom` in `template.json` too).
- In the Templates dialog a template of mine has **Edit…** (`templates:get` / `templates:update`: title, id, level, kind, texts and the whole `TEMPLATE.md`; the screens stay), **Show in Finder**, **Export ZIP…** (a folder `<id>/` ready for my templates of a colleague or for the `templates/` folder of a plugin) and **Delete** (`removeTemplate`, only a folder of my templates).

**Central management** is meant to go through the plugin marketplace: a plugin that ships a `templates/` folder is picked up as soon as it is installed, and a plugin update updates the templates. (A team source, a git repository or a shared folder configured in the app, was built and removed again until it is clear that the marketplace is not enough; see the git history of `templates.mjs`.)

## Using a template

1. Dashboard: the level switch and the chips come from `templates:list`; choosing a chip sets the template (a badge in the message field) and fills in its `prompt`.
2. On send, the renderer creates the project and calls `templates:apply(id)` (`applyTemplate`): the starter files go to `<project>/.studio/template/files/` together with `template.json` (+ `starterDir`, `appliedAt`) and `TEMPLATE.md` in `.studio/template/`. Nothing is put into the project folder itself, so the canvas never shows the sample screen of the template: the agent writes the screens the user asked for, named after them (a Product detail template asked for a course page gives `course-detail.html`, not `product.html` plus the course page).
3. `ClaudeService.send` reads `.studio/template/template.json` and appends `templatePrompt(meta)` to the system prompt: the project was started from the template, the instructions and the starter files are in `.studio/template/` (a worked example, not screens of the project): build exactly what the user asked for from that example, under names of its own, never copy the example unchanged. For the levels **app** and **route** the prompt adds fixed rules (`LEVEL_RULES` in `templates.mjs`): every route has a real route header (`RouteHeader` titled with the subject of the page, `ActionGroup` with the actions of the route), the same simulated Top and local navigation, no placeholders, no `Plus4U5App.Top` / `PositionBar`, follow the `mockup-route-layout` skill. The built-in `TEMPLATE.md` files of `app-basic` and `route-basic` spell out the header checklist (title, action order, overflow, icons, no breadcrumbs).

## Page: content for documents

A Page is not a part of an application: the user copies it with **Copy as uu5String** ([14](14-uu5string.md)) into a document (a uuBookKit page, a uuManagementKit portal). So it is built from the components the documents render, the Bricks of the `uu5bricks` plugin, and from nothing that the uu5String loses:

- only `Uu5Bricks`, `Uu5RichTextBricks`, `Uu5ImagingBricks`, `Uu5ChartsBricks`, `Uu5TilesBricks`, `Uu5CodeKitBricks` … and plain HTML for text; data straight in the props (it becomes `<uu5json/>`);
- no state, handlers, components with logic or `className` styling; no simulated Top, RouteHeader or shell;
- each library has its `uu5DemoDependencies` entry and an `import * as Ns from "package"`. The majors published on the CDN are in `BRICKS_LIBS` (`componentPreview.mjs`): `uu5bricksg01` 1.x, `uu5richtextg01-bricks` 3.x, `uu5imagingg01-bricks` 2.x, `uu5chartsg01-bricks` 3.x, `uu5tilesg02-bricks` 2.x, `uu5codekitg01-bricks` 3.x, `uu5animationg01-bricks` 2.x, `uu5mapsg01-bricks` 2.x, `uu5mathg01-bricks` 3.x (`uu5treeg01-bricks` is not on the CDN);
- the width of `#uu5` in the page's style is only for the preview (the collector of the uu5String starts below it).

`LEVEL_RULES.page` gives the agent these rules and points it to the `uu5bricks-knowledge` skill (Codex reads its `SKILL.md` among the mandatory files when the template level is `page`). The built-in Pages render without console errors and come out of the uu5String export without notes; `test/templates.test.mjs` checks that they use only Bricks that they load and import.

The catalogue (library browser, `@` suggestions, plan checks, drop snippets) reads the Bricks from the registry pages of the `uu5bricks` plugin (`skills/uu5bricks-knowledge/references/uu5bricks-kb/raw/*.md`, `parseBricksDoc` in `uu5Docs.mjs`); `CURATED` in `componentSnippets.mjs` has drop snippets for the common ones. A Bricks component dropped on a screen that does not import its library is handed to the agent.

## IPC

`templatesList` → `{ templates, levels, sources }`, `templatesReveal` (open the folder of my templates), `templatesApply(id)` → `{ written, skipped, screens }`.

## Not done yet

Replacing the screens of one of my templates (save it again under the same id), adding a Route / Component template to an existing project, generated previews of the templates, an editor.

## Custom frames (environments from a real page)

An environment is what a page is drawn in (`environments.mjs`). Besides the built-in `managementkit`, the user can make **custom frames** from any page: Screen title bar → "Shown in" → "New frame from a link…".

- `frames.mjs`: a frame is a folder `frame.json` (label, url, content-slot `offset`), `frame.html` (the shell with `{{title}}`, `{{breadcrumb}}`, `{{parents}}`), `frame.css`. Project frames live in `<project>/.studio/frames/`, global ones in `<userData>/frames/`. The environment id is `custom:<scope>:<id>`; `wrapPage(html, env, resolveFrame)` draws it the same way as the built-in shell (fixed, `data-uu5mock-shell`, so it never reaches uu5String or the agent's files).
- `frameCapture.mjs`: `PICKER` (choose the content slot by a click or a dragged rectangle; **Shift** adds more parts, kept as `data-uu5mock-slot` elements and `window.__uu5mockRects`, and the slot is the smallest rectangle around all the parts) and `EXTRACT` (everything outside the slot becomes flat, absolutely placed boxes) run in the preview window opened by `frames:capture` (session `persist:plus4u-preview`, so the Plus4U sign-in is kept). The draft is written to `<project>/.studio/frames-draft/`; `frames:saveDraft` stores it as a frame. Optionally Claude tidies the saved frame up through the chat (`tidyPrompt` in `frameDialog.js`).
- IPC: `env:list` (built-in + frames), `frames:capture`, `frames:saveDraft`, `frames:save`, `frames:remove`. Tests: `test/frames.test.mjs`.
