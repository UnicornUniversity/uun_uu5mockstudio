# 1. Getting started

## What you need

- A Mac (Apple Silicon is the supported build; see the [release page](https://github.com/UnicornUniversity/uun_uu5mockstudio/releases/latest) for others).
- **Claude Code** and a Claude account. The app drives *your* Claude Code, it does not contain an agent of its own. The first-run setup can install Claude Code for you.
- Claude Code **plugins**: `uu5-mockup` and `uugds` (required) and `uu5-development` (recommended; it provides the component documentation used by the `@` suggestions, the library browser and the checks of component names in plans). The setup dialog installs them from the uuCodebase marketplace, which needs access to uuCodebase over SSH.
- Internet access: uu5 pages load their libraries from the Plus4U CDN. The app caches them, and there is an [offline mode](09-appearance-and-settings.md#offline-use).

## Install

1. Download `uu5Mock-Studio-<version>-arm64.dmg` from the [latest release](https://github.com/UnicornUniversity/uun_uu5mockstudio/releases/latest) and drag **uu5Mock Studio** to **Applications**.
2. The builds are **not notarized by Apple**, so macOS blocks a downloaded copy. Once, open **Terminal** and run:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/uu5Mock Studio.app"
   ```

3. Open the app from Applications.

After that, updates from inside the app (**Check for Updates…**, then **Download**) install themselves and restart the app; they need no such step.

## First start

On the first run a **setup dialog** checks what is missing and offers to fix it with one click:

1. Claude Code installed? If not, the dialog installs it.
2. Signed in? The dialog opens the sign-in of Claude Code.
3. Plugins installed and up to date? The dialog installs or updates them. Plugin updates are offered, never applied silently.

Then the app shows the **dashboard** (see [Projects, screens and the canvas](02-projects-screens-canvas.md#the-dashboard)) and a short **welcome tour** (six cards: describing a screen, the chat, the canvas, the inspector, project memory, sharing). It opens only the first time; **Help → Welcome Tour…** shows it again. **Esc** closes any dialog.

## Your first screen

1. Type what you need in the message field at the bottom of the chat, for example *"A list of rooms with a filter and an Add room button"*, and press Enter (or the round arrow).
2. Claude writes `<name>.html` into the project folder; a frame with the screen appears on the canvas and reloads on every change. While Claude works, the frame pulses and the chat shows what it is doing.
3. Ask for changes in the same chat, or click the target button and pick a component in the screen to talk about exactly that one ([the chat](03-chat-and-agent.md)).

Next: [Projects, screens and the canvas](02-projects-screens-canvas.md).
