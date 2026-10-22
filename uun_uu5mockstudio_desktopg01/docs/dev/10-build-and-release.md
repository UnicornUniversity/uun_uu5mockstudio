# 10. Build and release

Requirements: Node 22. The target machine needs Claude Code installed (the app uses its login and plugins). The operator-oriented original is [RELEASING.md](../RELEASING.md) (in Czech); this chapter is the summary for developers.

## Scripts (`package.json`)

| Script | What it does |
| --- | --- |
| `npm start` | `electron .` (development; projects in `./projects`) |
| `npm test` | `node --test "test/*.test.mjs"` |
| `npm run pack` | unpacked app in `dist/<platform>-unpacked` (quick check of the packaged layout) |
| `npm run dist:mac` / `dist:mac:x64` | macOS dmg + zip (arm64 / x64) |
| `npm run dist:win` | Windows NSIS installer (x64) |
| `npm run dist:linux` | Linux AppImage (x64) |
| `npm run icon` | regenerates icons from `build/icon.svg` (`scripts/make-icon.mjs`) |

## Packaging (`electron-builder.config.cjs`)

- `appId` `net.uu5mock.studio`; artifacts are named `uu5Mock-Studio-<version>-<arch>.<ext>`.
- Only `src/**`, `package.json` and the needed `node_modules` are packed; the native `claude` binaries of `@anthropic-ai/claude-agent-sdk-*` (~240 MB per platform) are excluded because the app runs the user's own Claude Code (`pathToClaudeCodeExecutable`).
- `LICENSE` and `NOTICE` from the repository root travel in `Contents/Resources`.
- macOS needs the **zip** next to the dmg: the self-update installs from it.

## Signing

- **Without a certificate** (the normal case today) `build/adhocSign.cjs` (`afterSign`) signs the whole bundle ad hoc (`codesign --deep --sign -`). Without it the downloaded app is reported as "damaged"; with it the app is merely unidentified and opens through *System Settings → Privacy & Security → Open Anyway* (or `xattr -dr com.apple.quarantine`, see the user guide).
- **With a Developer ID**: `CSC_LINK`, `CSC_KEY_PASSWORD` and, for notarization, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (the last one switches `notarize` on and the ad-hoc step off). Entitlements: `build/entitlements.mac.plist` (JIT, unsigned executable memory, no library validation). Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.

## Updates

Two independent mechanisms:

1. **GitHub releases** (default): `Help → Check for Updates…` and a background check after start (at most every 6 hours, packaged app only) ask the latest release of `UnicornUniversity/uun_uu5mockstudio`. On macOS, for an app in a user-writable folder, **Download** installs the `.zip` by itself (`selfUpdate`); elsewhere it opens the installer or the page. `STUDIO_UPDATE_REPO` / `STUDIO_UPDATE_API` / `STUDIO_UPDATE_DOWNLOADS` point it elsewhere (tests).
2. **Feed** (`electron-updater`): only in a build made with `UU5STUDIO_UPDATE_URL=<url>`; upload all of `dist/` there. On macOS it needs a signed app.

## Release procedure

Branches: work on `sprint`, release from `release/x.y.z`, tag `vX.Y.Z`. Remotes: `origin` (uuCodebase) and `github` (public).

1. Bump the version: `npm version <x.y.z> --no-git-tag-version`.
2. Write `docs/release-notes/<x.y.z>.md`; commit.
3. `npm test`, then `npm run dist:mac` (and the other platforms when needed).
4. Tag, push the branches and tag to `origin`.
5. Public GitHub: `node scripts/publish-github.mjs` (dry run: checks only) then `--yes`. It creates **one new commit with the sources** on top of the last published snapshot and a GitHub release with the installers. It refuses to run with uncommitted changes, without installers of that version, when the release tag exists, or when nothing changed. Needs `gh auth login` and `git config uu5studio.githubAuthor "Name <e-mail>"`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `STUDIO_PROJECTS_DIR` | projects folder (beats everything; used by tests) |
| `STUDIO_PROJECT_DIR` | open this project folder directly |
| `STUDIO_CLAUDE_BIN` | path to the Claude Code executable |
| `STUDIO_NO_TOUR` | skip the welcome tour |
| `STUDIO_TEST` | test mode of the app (isolated, hooks such as `__plan`) |
| `STUDIO_EXPORT_DIR`, `STUDIO_MAIL_DRY_RUN`, `STUDIO_PICK_REPO` | export, mail draft and repository picking in tests |
| `STUDIO_INSTALL_CMD`, `STUDIO_MARKETPLACE_NAME`, `STUDIO_MARKETPLACE_SOURCE` | plugin installation steps of the setup |
| `STUDIO_UPDATE_URL`, `STUDIO_UPDATE_API`, `STUDIO_UPDATE_DOWNLOADS`, `STUDIO_UPDATE_REPO` | update sources |
| `UU5STUDIO_UPDATE_URL` | build time: feed URL for `electron-updater` |

## Verification status

Built, started and used on macOS arm64. Windows and Linux builds are produced but have not been run; detection of `claude.exe` / `.cmd` is covered by unit tests only.
