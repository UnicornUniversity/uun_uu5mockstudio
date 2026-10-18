# uu5Mock Studio

Desktop app for designing **uu5 / uuGDS user interfaces with an AI model**. Describe a screen in the chat and your own Claude Code builds it as an interactive uu5 mockup, shown live on an infinite canvas. Refine it by hand without writing code, keep the context of the project next to the screens, and hand the result over.

## What it does

- **Live canvas** of HTML screens (one file per screen): zoom, pan, device sizes, auto arrange, fullscreen preview.
- **Chat that builds screens.** Describe a screen in plain words, paste or drop a screenshot or a sketch, mention other screens with `@`. The agent works in your project folder, looks at the screen (screenshot) before it changes it, checks its own result in the live preview and can open dialogs and forms by clicking.
- **Inspector** for real uu5 components: change props (colors, icons from the uuGDS and uuBml catalogs, uuBml states, objects and arrays, conditional values), mark several components at once (Shift-click) and use them together in the chat. The change is written back into the HTML source.
- **Project memory** kept as plain files next to the screens:
  - a linked **git repository** (read-only for Claude, any branch as a snapshot, files mentioned with `@repo/…`),
  - **business rules** (`BUSINESS_RULES.md`, rendered or as Markdown, edited in place),
  - **descriptions** of the project and of every screen (`PROJECT.md`),
  - sticky **notes** per screen (`<screen>.notes.md`).
- **Export and share:** PNG / HTML / the whole project as ZIP, system share sheet on macOS.
- **Glass Effect (macOS):** an optional translucent, blurred look (View → Appearance → Glass Effect), light and dark.
- **First-run setup:** one-click Claude Code installer, sign-in, plugin install and update check (updates are offered, never applied silently).

## Requirements

- [Claude Code](https://code.claude.com) and a Claude account. The app drives *your* Claude Code, it does not ship its own agent.
- The Claude Code plugins `uu5-mockup`, `uugds` (required) and `uu5-development` (recommended). The setup dialog installs them from the `uu-technical-products-mp` marketplace over SSH, which needs access to uuCodebase. To use another source set `STUDIO_MARKETPLACE_SOURCE` (and `STUDIO_MARKETPLACE_NAME`) or create `prerequisites.json` in the app data folder.
- Internet access: uu5 pages load their libraries from the Plus4U CDN (cached locally, there is an offline mode).

## Install

Download the installer from the [latest release](../../releases/latest):

- macOS (Apple Silicon): `uu5Mock-Studio-<version>-arm64.dmg` (or the `.zip`).

The app tells you when a newer release is published (*Check for Updates…* and a check in the background): a strip above the chat offers the download. The builds are **not notarized by Apple**, so on macOS install once like this: drag the app from the `.dmg` to Applications, run `xattr -dr com.apple.quarantine "/Applications/uu5Mock Studio.app"` in Terminal, then open the app. Updates from inside the app need no such step. Windows and Linux builds can be produced from the source (see below) but are not published yet.

## Run from source

Node 22 is required. The application lives in the folder `uun_uu5mockstudio_desktopg01/`.

```bash
cd uun_uu5mockstudio_desktopg01
npm install
npm start          # the app, projects in ./projects
npm test           # unit tests
```

Build installers (output in `dist/`), details in [uun_uu5mockstudio_desktopg01/docs/RELEASING.md](uun_uu5mockstudio_desktopg01/docs/RELEASING.md):

```bash
npm run dist:mac       # macOS arm64: dmg + zip
npm run dist:mac:x64   # macOS Intel
npm run dist:win       # Windows x64
npm run dist:linux     # Linux x64 (AppImage)
```

## Where the data lives

A project is a folder (default `~/Documents/uu5Mock Studio/<project>/`, changeable in the app):

| What | File |
| --- | --- |
| Screens | `<name>.html` |
| Business rules | `BUSINESS_RULES.md` |
| Description of the project and of its screens | `PROJECT.md` |
| Notes of a screen | `<screen>.notes.md` |
| Chat history, canvas layout, linked repository | `.studio/state.json` (hidden, not exported) |
| Screenshots attached to requests | `.studio/attachments/` |

App-wide data (settings, CDN cache, read-only snapshots of linked branches) is in the application data folder (`~/Library/Application Support/uu5mockapp/` on macOS). The ZIP export contains the screens and, in `docs/`, the rules, the descriptions and the notes, but not `.studio/`.

## Configuration

| Variable | Meaning |
| --- | --- |
| `STUDIO_PROJECTS_DIR` | folder with the projects (overrides the default and the choice in the app) |
| `STUDIO_CLAUDE_BIN` | path to the `claude` executable |
| `STUDIO_MARKETPLACE_SOURCE`, `STUDIO_MARKETPLACE_NAME` | where the plugins are installed from |
| `UU5STUDIO_UPDATE_URL` | at build time: address of the update feed (enables auto-update) |

## Repository layout

| Path | Content |
| --- | --- |
| `LICENSE`, `NOTICE`, `README.md` | license, copyright with the additional permission, this file (the repository root holds only these and the app folder) |
| `uun_uu5mockstudio_desktopg01/` | the application, everything below is in it |
| `src/main` | Electron main process: projects, agent (Claude Agent SDK), export, JSX source editing, setup |
| `src/renderer` | the UI: canvas, chat, inspector, rules and description dialogs |
| `test` | unit tests (`npm test`) |
| `scripts` | helper and demo scripts, [publishing to GitHub](uun_uu5mockstudio_desktopg01/docs/RELEASING.md) |
| `docs` | [RELEASING.md](uun_uu5mockstudio_desktopg01/docs/RELEASING.md) (build and release), [DEMO.md](uun_uu5mockstudio_desktopg01/docs/DEMO.md) (script of the demo video) |

## License

Copyright (C) 2026 Unicorn Vysoká škola.

Licensed under the **GNU General Public License v3** (the same license as the uu5 libraries), see [LICENSE](LICENSE), with an **additional permission** that allows linking and distributing the app together with the proprietary Claude Agent SDK, see [NOTICE](NOTICE).

## Authors

Marek Beránek, Unicorn University.
