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

## Editing

All edits are pure functions on the tree by **path** (list of child indexes): `updateNode`, `addChild`, `addSibling`, `removeNode`, `duplicateNode`, `moveNode`, `indentNode`, `outdentNode`, and `moveTo(tree, from, to, position)` for drag and drop (refuses a move into its own subtree and a move of the root).

`describeEdits(original, edited)` lists what differs: removed or changed nodes (signature = parent > name [kind, change, notation]) and **changes of the order of children** (nodes with an `ordinal` are told apart by it, so a swap of two components of the same name is a change).

`approvalMessage({ text, tree, original, questions, answers })`: when nothing changed it is "Plan approved: build it exactly as planned." plus the answers; otherwise the edited text, the tree as JSON, the list of differences and the answers.

## The diagram

`layoutTree(tree, { collapsed })` gives `{ nodes, edges, width, height }` with a simple top-down tidy layout (leaves left to right, parents centred over their children; box 168 × 64 px). `dropTarget(layout, x, y, from)` maps a point to `{ path, position }` (left 35 % before, right 35 % after, the middle inside, the root only inside, never into the dragged subtree). `planDiagram.js` renders the boxes as HTML over an SVG of edges, with the camera in `entry.view`, drag with pointer events (a ghost, a mark of the landing place, Esc cancels), collapse and keyboard moves.

Edges go **from the child up to the parent** (arrow head at the parent); a small circle at the foot of the child means 1:1, none means 1:N.

## The component tree of an existing screen

`structureDialog.js` shows the tree read by `jsx:structure` in the same diagram. Each drag is logged as an op `{ ordinal, target, position, name, targetName }` (ordinals of the nodes). **Regenerate**: `jsx:moves` applies the safe ops to the file (and records an undo step) and returns `{ applied, failed, structure }`; the renderer then shows the **preview bar**: the screen on the canvas is the preview, **Undo** calls `screen:undo`, **Keep** keeps it and, if some ops failed, sends `regenerateMessage({ file, original: <structure after the safe moves>, tree, notes, part })` to the agent (Agent mode). See [05](05-screen-source.md#moves).
