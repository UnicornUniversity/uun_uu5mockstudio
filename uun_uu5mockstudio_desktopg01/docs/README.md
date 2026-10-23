# uu5Mock Studio documentation

uu5Mock Studio is a desktop app for designing uu5 / uuGDS user interfaces with an AI model. You describe a screen in a chat and your own Claude Code builds it as a real, interactive uu5 page; you then inspect it, change it by hand, plan bigger changes, and keep the business rules next to the screens.

| For | Start here |
| --- | --- |
| **People who use the app** (analysts, designers) | [User guide](user/README.md) |
| **People who develop or maintain the app** | [Technical documentation](dev/README.md) |
| What changed in a version | [Release notes](release-notes/) |
| How a version is built and published | [RELEASING.md](RELEASING.md) (Czech) and [dev/10-build-and-release.md](dev/10-build-and-release.md) |
| How the demo video is recorded | [DEMO.md](DEMO.md) |

The documentation describes the app as of version 0.5.2. The text is in English; the app itself is in English too.

## Conventions

- **Screen**: one `.html` file in a project folder. **Project**: a folder with screens and the project memory.
- **Agent**: the Claude Code of the user, driven by the app (the app ships no model of its own).
- `⌘` is the Command key on macOS; on Windows and Linux read it as `Ctrl`.
