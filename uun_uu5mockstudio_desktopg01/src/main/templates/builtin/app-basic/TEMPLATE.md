# Application (uu5Uve)

An application (a user view entrypoint): the project starts with three route files that share one shell: simulated Top, local navigation (a Drawer opened by the menu button) and a **route header** with actions. The menu items link the files (`home.html`, `items.html`, `item-detail.html`).

## Build it like this
1. Ask the user (one question at a time) who uses the application, which entities it works with and the main use cases. From them decide the **routes** (usually: a home or overview, a list per main entity, a detail per entity, a route for each larger use case). Write the business rules you learn.
2. Rename the generic route files (`items.html`, `item-detail.html`, `home.html` if it has a better name) after the real routes and entities (kebab-case: `theses.html`, `thesis-detail.html`), add or remove files, and update `MENU_ITEM_LIST` **in every file** so the local navigation is identical everywhere and the focused item is the current route. Keep the simulated Top identical in all files (real organization and application name) and give every file the `<title>` "<route> – <application name>" (the project is named after the application name).
3. **Every route gets its own route header** (the band under the Top), never the placeholder:
   - `Plus4U5App.RouteHeader` titled with the subject of that route ("Study programmes", "Thesis assignment"), `category="interface" segment="title" type="major"`.
   - `Uu5Elements.ActionGroup` with the actions of **that route's** use cases: additional actions (subdued) first, then the main actions (`significance="common"`, one primary), then overflow-only actions with `collapsed: true`. No manual "⋮" item.
   - The header is for the actions and use cases of the route; moving between routes belongs to the local navigation, not to header buttons. No breadcrumbs, no divider between the header and the content, no `Plus4U5App.Top` / `PositionBar`.
   - Icons only from the uuGDS catalogue (uugds-icons skill).
4. **Content**: replace each placeholder block with real content (read the uuGDS content, interaction, layout and navigation rules first, the forms rule for forms). A list route offers a way to the detail route (a link or an action), a detail route a way back.
5. If the skill `mockup-route-layout` is available, follow it for the shell and the header.
