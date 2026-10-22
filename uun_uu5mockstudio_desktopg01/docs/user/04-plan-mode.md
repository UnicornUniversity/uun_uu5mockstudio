# 4. Plan mode

Use Plan for a bigger step: a new screen, a rewrite, several screens. Claude proposes a plan; you answer its questions, rearrange the component tree, and only then approve. In Plan mode Claude **cannot write any file**.

Switch with the mode menu under the message field (**Agent ▾ / Plan ▾**), then describe what you want. Claude may read your screens, take screenshots and read the component documentation while it plans.

## What a plan contains

1. **A summary**: what will be built or changed and why, the decisions Claude made, and the **business rules the plan implies** (they are recorded when the plan is built).
2. **Questions** (when Claude needs your decisions): cards with options, up to four questions. The recommended option is first and is marked *(Recommended)*; some questions allow several answers; every question has an **Other…** field. The header shows how many are answered.
3. **A component tree**: the screen as a tree of components, in the order they are rendered.

The answer of Claude is shown once, as the finished plan (while it is written the chat shows "Preparing the plan…").

## Answering the questions

Click the options (or type in **Other…**). Unanswered questions are left to Claude, which says what it chose. **Update the plan with my answers** sends your answers back and Claude returns an updated plan (the old one is marked as replaced); **Build** sends the answers with the approval.

## The component tree

The tree is a diagram by default (switch to **Outline** for a compact list):

- Boxes from top to bottom, siblings from left to right **in the order of rendering**. A box shows the name of the component, a colour for its kind (screen, **library** component, **new** component to write, **existing** part of the screen), a mark for the change (**add**, **modify**, **remove**, **keep**) and a short note.
- **Arrows go from a component up to the one it is nested in.** A small circle at the foot means a 1:1 relation; no circle means 1:N (see below).
- Marks: **×N** the component is rendered once per item of a list; **R** it is rendered only under a condition; **D** it is disabled under a condition; **`// label`** the data it shows; a dashed box is less important or not decided yet. Hover a box to read the condition.
- **Zoom and move**: ⌘ + scroll, the buttons, drag the background. **Fit** shows everything, **⤢** opens it large. A subtree can be collapsed with the small button under a box.
- **Rearrange by dragging**: drag a box onto another one. The left third puts it **before**, the right third **after**, the middle **inside** it. A mark shows where it will land; Esc cancels. It also works from the keyboard (select a box, ⌥ + arrows).
- **Edit plan** opens the text of the plan and a form for the selected component: name (or **Choose from libraries…**), kind, change, note, **Repeated** (1:N), data, `// label`, R and D conditions, low importance; add a child or sibling, duplicate, delete, move, indent.

Names marked **not in the docs** are library components the documentation does not know: check them or mark them as new.

## Building the plan

- **Build this** (or **Build the edited plan**) on the card, or the **Build plan** send button, approves the plan and switches back to **Agent**. If you rearranged or edited the tree or answered questions, the edited plan and your answers go to Claude, and it follows them exactly.
- **Revise…** asks for changes in words; **Discard** drops the plan.

## The method behind the tree

The tree follows the decomposition method used at Unicorn (based on Jackson Structure Programming): rendering goes top-down and data flows only top-down (a child reports upward only through handlers passed down). A parent only composes its children, and each child does one job: the component that loads data sits above the one that shows it; a state resolver (loading, error) comes before the content; modals belong to the view. See also [The component tree of a screen](06-component-tree.md), which shows the same notation for a screen that already exists.
