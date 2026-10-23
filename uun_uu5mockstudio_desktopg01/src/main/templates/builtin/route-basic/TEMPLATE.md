# Route (uu5Route)

One route of an application: a simulated Top strip, a flush **route header** (title and actions) and a padded content column.

## Build it like this
1. Ask the user (one question at a time) what the route is for, which data it shows and which use cases start from it. Write the business rules you learn.
2. **Route header** (the band under the simulated Top; never skip it, never leave the placeholder):
   - `Plus4U5App.RouteHeader` with `title` naming the **subject of the page** (the person, the entity, the use case: "Thesis assignment", not "Route title"), `category="interface" segment="title" type="major"`.
   - `Uu5Elements.ActionGroup` on the right, ordered: additional actions (subdued, neutral) first, then the **main** actions (the use cases of this route, e.g. Create, Edit; `significance="common"`, primary for the one main action), then overflow-only actions with `collapsed: true` (Help, Copy…). Do not add a manual "⋮" item; the group makes it.
   - No breadcrumbs, no extra divider between the header and the content, no `Plus4U5App.Top` / `PositionBar` (the shell is simulated).
   - Icons only from the uuGDS catalogue (use the uugds-icons skill); never invent `uugds-*` names.
3. **Simulated Top**: keep it, but replace "Organization / context line" and "Application name" with the real organization and application.
4. **Content**: replace the placeholder block with blocks built from the uu5 components (read the uuGDS content, interaction and layout rules first; for forms the forms rule). Hero band under the header only when the route names a primary subject.
5. If the skill `mockup-route-layout` is available, follow it for every detail of the layout above.
