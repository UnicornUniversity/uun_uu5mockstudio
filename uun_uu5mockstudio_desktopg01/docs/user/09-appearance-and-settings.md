# 9. Appearance and settings

## Theme and Glass Effect

The theme is chosen in **View → Appearance** (the dashboard also has a ◐ button). It offers **Automatic** (follows the system), **Light** and **Dark**. On macOS **Glass Effect** gives the app a translucent, blurred look in light and dark; it is optional and can be switched off at any time.

## Layout of the chat

**Chat → Floating / Docked Chat (⇧⌘L)** or the button in the chat header. A floating chat can be dragged by its header, resized from every edge and minimized with **_** to a round bubble. Docked, it is a column on the left. The preview in fullscreen has its own remembered position of the chat.

## Offline use

Screens load the uu5 libraries from the Plus4U CDN. The app caches them, so screens keep rendering without a network.

- **View → Offline Use → Offline Mode**: everything loads from the cache only (the screens reload).
- **Warm Up CDN Cache**: loads the common libraries (core, forms, tiles, charts, Plus4U5) once so that they are available offline.
- **Clear CDN Cache**: empties it.

## Claude Code and plugins

**Help → Claude Code & Plugins…** shows what is installed and signed in, and installs or repairs it. **Help → Check for Plugin Updates…** looks for newer plugins; updates are offered, never applied silently.

## Updates of the app

**Help → Check for Updates…** (and a check in the background after the start, at most every six hours) asks GitHub for the latest release. The update notices (app and plugins) sit in one place: under the header of the dashboard, and in a strip above the chat inside a project; messages such as “You are up to date” appear at the bottom of the window in both. A strip above the chat offers **Download**, **Notes** (the release notes) and **Later**. On macOS the **Download** button installs the new version itself (from 0.3.0 on) and restarts the app.

## Where things are stored

| What | Where |
| --- | --- |
| Projects, screens, rules, descriptions, notes | **Documents → uu5Mock Studio** (change it in **Project → Projects Folder**) |
| Rules for all projects | `GLOBAL_RULES.md` in that folder |
| Conversations, canvas layout, attached images | `.studio/` inside each project |
| App settings (last project, offline mode, folder) | the application data folder of the app (`app-state.json`) |
| Small view preferences (mode, panels, bubble positions) | the app's local storage |
