# 9. Appearance and settings

## Theme and Glass Effect

The theme is chosen in **View → Appearance** (the dashboard also has a ◐ button). It offers **Automatic** (follows the system), **Light** and **Dark**. On macOS **Glass Effect** gives the app a translucent, blurred look in light and dark; it is optional and can be switched off at any time. With it on, the whole app uses the same glass materials: the sidebars (chat, dashboard navigation) are a soft tint over a light colour wash, the toolbar, description strip, inspector and selection bar are frosted glass floating over the canvas, and menus, dialogs, toasts, dashboard cards and buttons are glass capsules and cards. With **Reduce transparency** on in the macOS accessibility settings the effect switches itself off.

## Your role

On the first run (before the welcome tour) the app asks what describes your work best: **UI/UX designer**, **Web and marketing**, **Solution architect** or **Quick start** (a page or a portal fast, without design details; Skip chooses it). The role presets the starting point once:

| | UI/UX | Web and marketing | Solution architect | Quick start |
| --- | --- | --- | --- | --- |
| Templates on the dashboard | Route | Web | Component | Document |
| Eco | off | on | off | on |
| First Share format | Image | HTML file | Project ZIP | Image |
| Simple view | no | yes | no | yes |

The architect also gets **Plan** switched on when choosing Application or Route on the dashboard. The **Advanced** button at the left of the zoom controls in the top bar (and on the dashboard, next to the model) switches the whole app between the **simple view** and **Advanced** (highlighted = on); point at it for an explanation. A role only chooses the starting view: Web and marketing and Quick start start in Simple, the others in Advanced.

The simple view keeps what is needed to describe, look at, edit and share a design, and hides the rest: Plan, the token lines (shown only under a large request, with the hint that a new conversation is cheaper), the choice of the model (the model in use is shown as plain text; Sonnet is preset for the simple roles unless you chose a model before), the Components tab and the cube button, the business rules button, the environment, “Save as template” and “Height to fit” buttons of the frames, the Application, Route and Component levels and Templates… on the dashboard, and in the context menu of a screen: Add rule, Mention in chat, Show component tree and Show in Finder; in the inspector: Add prop, Copy as uu5String and Show component tree. **Editing by hand (the inspector) is always available.** The menu bar is not reduced.

The agent also gets a sentence about who you are (short and plain for Web and marketing and Quick start, exact and with decisions for the architect).

Change it any time with the role button at the top right of the dashboard or in **Help → Your Role…**. Choosing a role sets the presets again; what you change by hand afterwards (Eco, Plan, the template level, the Share format) stays. If you already used the app, a quiet strip on the dashboard offers the choice once instead of a dialog.

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
