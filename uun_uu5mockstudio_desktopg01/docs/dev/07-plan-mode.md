# 7. Plan mode and the component tree

## Formats the agent writes

A Plan answer is Markdown with two fenced JSON blocks:

````
```uu5-tree
{ "name": "Screen: rooms", "kind": "screen", "children": [ { "name": "Plus4U5Elements.ContentContainer", "kind": "library", "children": [ … ] } ] }
```
```uu5-questions
{ "questions": [ { "id": "q1", "header": "Detail", "question": "…?", "multiSelect": false,
    "options": [ { "label": "Side panel (Recommended)", "description": "…" }, { "label": "Modal" } ] } ] }
```
````

**Tree node**: `name`, `kind` (`screen` | `new` | `library` | `existing`), optional `change` (`add` | `modify` | `remove` | `keep`), `note`, `children`, and the notation of the decomposition method: `relation: "1:N"` (rendered once per item), `render` (condition, label R), `disabled` (condition, label D), `label` (the data it shows, `// label`), `low: true` (low importance), `data` (what it receives from its parent), and, for trees read from a file, `ordinal`. `normalizeTree` drops unknown keys, clips texts, limits the size (300 nodes, depth 12).

**Questions**: up to 4, each with 2–6 options (`normalizeQuestions`).

## From an answer to a plan card

`extractPlan(answer)` → `{ text, tree, questions }`: finds both blocks and removes them from the text. **Fallback**: if there is no `uu5-tree` block but a fenced block with drawn branches (`├─ └─ │`), `parseAsciiTree` reads it (depth from the column of the branch; `×N` becomes `relation`). Plan answers are always turned into a card, even without a tree.

While the agent writes, entries flagged `planning` are shown as "Preparing the plan…" (`entryEl`); `convertPlan` replaces the last answer by a `kind: "plan"` entry `{ text, tree, questions, answers, original, state, mode, sel, collapsed, view, … }`. States: `proposed` → `approved` | `discarded` | `superseded` (after **Update the plan with my answers**).

## Plans as files

`convertPlan` also saves the plan as `<project>/plans/<slug>.md` (`savePlanFile`, IPC `plans:save`): a front matter (`title`, `status`: `draft` | `approved` | `built` | `discarded`, `created`) and the plan text followed by the `uu5-tree` / `uu5-questions` blocks. The entry keeps `planSlug` and `synced` (`{ body, status }`, the last text known to be equal on both sides). **The file is the truth**: `queueFileSync` (called from `persist`) writes changes of the chat card after 600 ms; `onPlansChanged` / `pullEntry` read the file when it changes (watcher event `plans:changed`) and, when it differs from `synced`, put text, tree, questions and status into the entry (answers are kept by question id). The states map `proposed → draft`, `approved → approved`, `discarded` and `superseded → discarded`. Cards: `planCards.js` (see 03-renderer). Pure helpers (front matter, slug, status) are in `renderer/planDoc.js`, files in `main/plans.mjs`.

## Sitemap

For portals and web sites `planPrompt()` asks for a third block, `uu5-sitemap`: `{ "root": { id, title, type: "page" | "section" | "group" | "external" | "stub" (a stub is a page that is not solved in the project: kept, no screen, not counted; a section is part of the page above it: no screen, not counted by `countPages`, listed in the message of **Create the screen**), file?, note?, comment? (a review comment of the user, to be resolved by the agent on a revision), children } }`. `sitemap.js` (pure; `relocateNode` is the drag and drop of a page: before / after / inside another one, never the root or into its own subtree) normalizes it (`normalizeSitemap`: ids made unique, ≤ 200 nodes, depth ≤ 8, only `*.html` file names), reads and writes the block (`extractSitemap`, `replaceSitemapBlock`) and edits by path (`updateNode`, `addChild`, `addSibling`, `removeNode`, `moveNode`, `indentNode`, `outdentNode`). `extractPlan` returns `sitemap` too, the plan entry keeps it (`entry.sitemap`, `original.sitemap`), `approvalMessage` sends it when it was edited. `sitemapView.js` draws the map (a CSS tree) and the editor of the selected page; the card (`planCards.js`) shows the text, then `mapSection` (header with progress `countBuilt`, fold state `c.collapsed`: `foldable`, `defaultCollapsed`; the map in a box with its own scrolling) and `treeSection`, and writes every change into the file at once; editing, revising and the progress stay available after **Approve the map**. `sitemapFromScreens({ screens, edges })` makes a first map of the existing screens (the root: index / home or the screen with most links; the hierarchy follows the non-menu links of `flow:edges`, breadth first), `linkDiff(sm, edges, screens)` says what the screens do that the map does not (`extra` links between pages that are neither parent and child, nor on one path, nor siblings; `unmapped` screens; `missing` files), `addScreenPage` adds a screen as a page; the card draws `extra` as curves over the map (`renderSitemap(...).draw()`). **Create the screen** → `createScreenFromPage` (renderer.js) sends the agent the page, its place in the map and its file name.

## The sitemap of the project

**Where it is offered.** `sitemapOffered({ hasSitemap, scope, level })` (`renderer/sitemap.js`) decides: a sitemap that exists → yes; scope `site` → yes; scope `single` → no; no scope (a project from before 0.20.0) → only the levels `web` and `page`. The renderer (`mapOffered()`, `updateMapBtn()` in `renderer.js`) hides `#mapw` otherwise, `planCards.js` leaves out the "no sitemap yet" bar (`ctx.sitemapOffered`), and the Plans menu (`plansMenu.js`, `state().offered === false`) gets the ways to make a map instead. The scope is chosen on the dashboard (`#dash-scope`, only for Web and Document; `dashboard.js`), stored with the level by `project:setKind` in `state.kind` and returned in the project payload (`level`, `scope`). A project of scope `site` sends its first message in Plan mode. `kindPrompt(kind)` (`claudeService.mjs`) tells the agent: scope `site` → the sitemap comes first; scope `single` or the levels app / route / component → no sitemap unless the user asks for one.

`main/sitemapFile.mjs` reads and writes `<project>/sitemap.json` (`readSitemap`, `writeSitemap` with `backup`, `restoreSitemap`). The map of a plan is a proposal; **approving** the plan (`adoptSitemap` in renderer.js, or `approvePlanFile` for a plan without a chat entry) writes it to the file with a backup, removes it from the plan entry (`sitemapMoved`) and adds a note to the plan text. `planCards.js` has a second kind of card, `kind: "sitemap"` (key `@sitemap`, `setSitemap({ sitemap, hasPrev })`): the same `mapSection` as in a plan card, with `projectIo` (saves at once through `ctx.saveSitemap`) instead of `planIo` (writes into the plan file). **Revise with the agent** on it sends `reviseMessage({ slug: null, … })`; the agent answers with a plan, so the change goes through review. `memoryPrompt({ sitemapBlock })` gives the agent the map as an outline (`sitemapOutline`) with the rule that it never edits the file and builds only what is asked. `plansMenu.js` makes the two toolbar menus (`#mapw` for the sitemap, `#plansw` for the plans): show / hide, make a sitemap.

## Sitemap from a link

A sitemap can start from pages that exist: the user gives the address of a web site, of a uuBookKit book or of a uuManagementKit document / portal, the app reads the structure of the pages behind it and the user picks all or some of them.

- **Reading** is `docFetcher.structure(url)` in the main process (IPC `docs:structure`), read-only, nothing is saved. A book: `toolUuBookKitGetBookStructure` (its menu), else `toolUuBookKitListPages` (flat), the name from `toolUuBookKitWorkspaceLoad`. A document or portal: `toolUuManagementkitEccDocumentGetMetadata` (its pages) and the load tool of the page, whose uu5Strings are searched for links. A web site: `readWebLinks` opens the page in the hidden window of the preview session and collects its `a[href]` with the area (nav, header, content, footer: by tag, role or class name, since many sites build menus of plain divs) and the level in the menu (nesting in lists, else the depth inside the menu); `listSitemapUrls` (`webImages.mjs`) reads `/sitemap.xml` with the checks of a download. The sign-in, territory and npx states are those of `fetchDoc`.
- **`siteStructure.js`** (pure) turns each source into one tree to pick from: `{ id, title, url, kind, group?: "nav" | "pages" | "content" | "footer" | "sitemap", expandable?, children }`. `bookToTree`, `eccToTree` (with `uu5Links`: links of tags and of `<uu5json/>` item lists; a component with navigation, or a section that is mostly links, gives group `nav`), `webToTree` (same host only; the menu nested as its lists; the pages of the sitemap.xml nested by the folders of their paths). The results of the MCP tools are not documented in detail, so the readers accept several shapes (an `itemMap` with indents or parents, a list, nested lists) instead of one.
- **`sitePicker.js`** is the dialog: a tick at every page (a tick takes the page with all below it, Alt+click only the page), groups as tags, **Load its pages** on a node that can be unfolded (`mergeChildren`: one more `docs:structure` call, pages the tree already shows are left out). The menu and the pages of a book or document are ticked at first; the links of the content, the footer and the sitemap.xml are not.
- **Two outcomes.** **Use as the sitemap**: `pickToSitemap` → `sitemap:write` with a backup (a node that is not ticked but has ticked pages below stays as a `group`; a web page a portal links to is `external`). **Hand to the agent**: `pickOutline` waits as an attachment (`sitePick` in `renderer.js`) and goes with the next message as `structureContext(...)`, in Plan mode. With a sitemap in the project (`existing: true`) the text tells the agent to extend or change that map with the pages and to answer with the whole revised map, never to start a new one. The addresses are never put into the message field: every link there would get a document card.
- **`source`.** A node of the sitemap may keep the address it was taken from (`normalizeSitemap`, `updateNode`, the **Source** field of the page editor, `sitemapOutline`, the `uu5-sitemap` format). No content is read when the map is made: `sourcesOf` in `renderer.js` calls `docs:fetchSource` for the pages a screen is built for and adds `docsContext(...)` to the build request.
- **Entry points:** **From a link…** among the ways to make a sitemap (`plansMenu.js`), and the card of a pasted link (`docCards.js`, only where the sitemap is offered: in the chat, and on the dashboard with the scope *whole site*). The card has a switch **Reference / Sitemap**: a reference goes to the agent as `docsContext` (the page to read and redesign), a sitemap link as `structureContext` (the structure behind it, read at once with `docs:structure`; **Choose the pages…** opens the picker and keeps the pick on the card). This switch, not the link, tells the agent what the link is for. On the dashboard **Use as the sitemap** keeps the pick (`dashPick`) for the project it creates.
- **Access.** Plus4U structures are read through the MCP proxy with the user's token. A web site is read in the preview session: **Load with my access…** in the picker (`docs:webLogin`) opens the site to sign in, then the structure is read again.

## Editing

All edits are pure functions on the tree by **path** (list of child indexes): `updateNode`, `addChild`, `addSibling`, `removeNode`, `duplicateNode`, `moveNode`, `indentNode`, `outdentNode`, and `moveTo(tree, from, to, position)` for drag and drop (refuses a move into its own subtree and a move of the root).

`describeEdits(original, edited)` lists what differs: removed or changed nodes (signature = parent > name [kind, change, notation]) and **changes of the order of children** (nodes with an `ordinal` are told apart by it, so a swap of two components of the same name is a change).

`approvalMessage({ text, tree, original, questions, answers })`: when nothing changed it is "Plan approved: build it exactly as planned." plus the answers; otherwise the edited text, the tree as JSON, the list of differences and the answers.

## The diagram

`layoutTree(tree, { collapsed })` gives `{ nodes, edges, width, height }` with a simple top-down tidy layout (leaves left to right, parents centred over their children; box 168 × 64 px). `dropTarget(layout, x, y, from)` maps a point to `{ path, position }` (left 35 % before, right 35 % after, the middle inside, the root only inside, never into the dragged subtree). `planDiagram.js` renders the boxes as HTML over an SVG of edges, with the camera in `entry.view`, drag with pointer events (a ghost, a mark of the landing place, Esc cancels), collapse and keyboard moves.

Edges go **from the child up to the parent** (arrow head at the parent); a small circle at the foot of the child means 1:1, none means 1:N.

## The component tree of an existing screen

`structureDialog.js` shows the tree read by `jsx:structure` in the same diagram. Each drag is logged as an op `{ ordinal, target, position, name, targetName }` (ordinals of the nodes). **Regenerate**: `jsx:moves` applies the safe ops to the file (and records an undo step) and returns `{ applied, failed, structure }`; the renderer then shows the **preview bar**: the screen on the canvas is the preview, **Undo** calls `screen:undo`, **Keep** keeps it and, if some ops failed, sends `regenerateMessage({ file, original: <structure after the safe moves>, tree, notes, part })` to the agent (Agent mode). See [05](05-screen-source.md#moves).
