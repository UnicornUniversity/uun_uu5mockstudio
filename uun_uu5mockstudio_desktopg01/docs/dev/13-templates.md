# 13. Templates for new projects

The dashboard offers **templates** on three levels, after the uu5 / uuAppFramework vocabulary: **Application** (uu5Uve: a shell with navigation and several routes), **Route** (uu5Route: one screen with a route layout) and **Component** (form, list, detail, dashboard…). A template is a starting point for the agent, not a finished screen.

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
| `level` | `app`, `route` or `component` |
| `kind` | optional: `form`, `list`, `detail`, `dashboard`… (chooses the icon) |
| `icon` | optional icon key (`app`, `route`, `form`, `list`, `detail`, `dashboard`) |
| `prompt` | the sentence put into the message field when the template is chosen |
| `order` | sort order inside a level (default 50) |
| `files` | optional list of starter files (default: every `*.html` in the folder) |
| `tags` | optional |

`parseTemplate` (in `src/main/templates.mjs`) refuses a template with a bad id or level, a missing title, no starter file, an unsafe file name (only `[\w][\w.-]*.html`, no paths), a file that is not a plain file (symbolic links are refused), a file over 512 KB or more than 24 files. A refused template is listed with its reason in the Templates dialog and otherwise ignored.

## Sources

Later sources win over earlier ones by `id`:

1. **Built-in**: `src/main/templates/builtin/` (shipped with the app: `app-basic`, `route-basic`, `form`, `list`, `detail`, `dashboard`), written by hand after the uu5-mockup conventions (simulated Top, `RouteHeader`, `ActionGroup`, Drawer navigation).
2. **Plugins**: `templates/<id>/template.json` inside any installed Claude Code plugin (found through `~/.claude/plugins/installed_plugins.json`), and the bare skeletons of the `uu5-mockup` skill `create-mockup` as components (`legacy`; they are hidden where a template of the same level and kind exists).
3. **My templates**: `<userData>/templates/mine/` (the **Open folder** button of the Templates dialog opens it).

**Central management** is meant to go through the plugin marketplace: a plugin that ships a `templates/` folder is picked up as soon as it is installed, and a plugin update updates the templates. (A team source, a git repository or a shared folder configured in the app, was built and removed again until it is clear that the marketplace is not enough; see the git history of `templates.mjs`.)

## Using a template

1. Dashboard: the level switch and the chips come from `templates:list`; choosing a chip sets the template (a badge in the message field) and fills in its `prompt`.
2. On send, the renderer creates the project and calls `templates:apply(id)` (`applyTemplate`): the starter files are copied into the project (an existing file is never overwritten) and `template.json` (+ `written`, `appliedAt`) and `TEMPLATE.md` go to `<project>/.studio/template/`.
3. `ClaudeService.send` reads `.studio/template/template.json` and appends `templatePrompt(meta)` to the system prompt: the project was started from the template, the starter files are …, read `.studio/template/TEMPLATE.md` first and change the starter files instead of starting from scratch. For the levels **app** and **route** the prompt adds fixed rules (`LEVEL_RULES` in `templates.mjs`): every route has a real route header (`RouteHeader` titled with the subject of the page, `ActionGroup` with the actions of the route), the same simulated Top and local navigation, no placeholders, no `Plus4U5App.Top` / `PositionBar`, follow the `mockup-route-layout` skill. The built-in `TEMPLATE.md` files of `app-basic` and `route-basic` spell out the header checklist (title, action order, overflow, icons, no breadcrumbs).

## IPC

`templatesList` → `{ templates, levels, sources }`, `templatesReveal` (open the folder of my templates), `templatesApply(id)` → `{ written, skipped, screens }`.

## Not done yet

Saving a screen as a template from the UI, adding a Route / Component template to an existing project, generated previews of the templates, an editor.
