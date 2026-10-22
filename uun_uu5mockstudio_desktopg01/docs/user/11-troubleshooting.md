# 11. Troubleshooting

| Problem | What to do |
| --- | --- |
| macOS says the app "is damaged" or cannot be opened | The build is not notarized. Run once: `xattr -dr com.apple.quarantine "/Applications/uu5Mock Studio.app"`. |
| The setup dialog says Claude Code is missing or you are not signed in | Use **Help → Claude Code & Plugins…**: it installs Claude Code and opens the sign-in. |
| The plugins cannot be installed | They come from the uuCodebase marketplace over SSH: check that you have access to uuCodebase and that your SSH key works. |
| A screen stays blank | Ask Claude to check the screen (it reads the console and takes a screenshot itself). Usually a library did not load (no network, see **Offline Use**) or the page has a script error. |
| A screen does not render offline | Turn on **Offline Mode** only after **Warm Up CDN Cache** was done once with a network. |
| The inspector says an item "is not an object written out in the JSX" | The list is built in code (a function or `.map`), so only the component itself can be edited. Ask in the chat, or rearrange the file. |
| "has N items but M are rendered" | Some items are added or filtered by code. Ask Claude to change that list. |
| Undo says "the file was changed outside of the app" | Someone (usually the agent) changed the file after your last step, so the older steps were dropped to protect that work. |
| The chat does not react | Check the status strip: Claude Code may be busy (press **Stop**), signed out, or the network may be down. |
| Claude wrote files in Plan mode | It cannot: the file tools are removed in Plan. If a screen changed, you were in Agent mode. |
| A component name in a plan is marked **not in the docs** | The `uu5-development` plugin documentation does not list it. Check the name, pick it from **Choose from libraries…**, or mark it as new. |
| I deleted a screen by mistake | The file is in the trash. Its rules and description are in `.studio/removed-screen-memory.md` of the project. |

If something else goes wrong, note what you did, what you expected and what happened, and send it together with the version (**About** in the app menu) to the maintainers.
