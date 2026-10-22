# 12. Security and privacy

## What the app trusts

- **The user's own Claude Code.** The app runs it (Agent SDK) with the user's login; it stores no credentials of its own and never prints tokens.
- **Mockup code is untrusted.** Screens are generated HTML/JS. They run in `<webview>` elements served from a local static server, not in the app's own page, and have no access to `window.studio`.
- **The renderer** talks to the main process only through the `contextBridge` API in `preload.cjs`; every handler validates its arguments and returns `{ error }` instead of throwing.

## The agent's file access (`repo.mjs: accessPolicy`)

Every tool call goes through `canUseTool` → `toolVerdict` → `accessPolicy`:

- **writes** (`Write`, `Edit`, `MultiEdit`) only inside the project folder, plus single extra files the app names (the global rules file);
- **reads** (`Read`, `Glob`, `Grep`) inside the project folder, the Claude plugin folders (`~/.claude`, `~/.skilled-plus4u-mcp`) and, when a repository is linked, that repository, **except secrets** (env files, keys, git internals, dependencies);
- everything else is denied with a message the agent sees;
- in **Plan mode** the file-changing tools and Bash are additionally disallowed, so a plan cannot change anything.

A linked repository is read from a **`git archive` snapshot** of the chosen branch (no checkout, nothing in the repository is touched); branch names are validated.

## Network and links

- Links in screens and in the app open in the system browser, **https only** (`setWindowOpenHandler`, `open:external`); no new app windows.
- Library code comes from CDNs; responses are cached on disk (`cdn-cache/`) and can be served offline. The cache is keyed by URL and holds only public library files.
- The only calls the app itself makes are the update check (GitHub API), the uuBml catalog and the documentation lookups of the installed plugins.

## Data at rest

Everything is local: projects in the projects folder, app settings in `app-state.json`, chats in `.studio/state.json`. Attached images are copied to `.studio/attachments`. Nothing is uploaded except what Claude Code itself sends to Anthropic as part of a conversation. **Share** creates a mail draft or a file; the user sends it.

## Known limits

- The app is **not sandboxed** and, without a Developer ID, only ad-hoc signed; macOS asks the user to allow it once.
- `webviewTag` is enabled, and the main window runs with the default Electron web preferences plus a preload; screens are isolated only by being separate guests, so do not load untrusted sites in them.
- The entitlements allow JIT and unsigned memory (needed by Electron) and disable library validation (needed for the ad-hoc signature).
