# 6. The component tree of a screen

A screen is a tree of components. The component tree shows it as a diagram, in the same notation as a plan ([Plan mode](04-plan-mode.md#the-component-tree)), and lets you **rearrange** it.

## Opening it

- **Screen → Show Component Tree…**, or **Show component tree** in the context menu of a screen: the tree of the whole screen.
- **Show component tree** in the inspector: the tree of the component you picked (it becomes the root).

The tree is read from the file; nothing is sent to Claude. It shows components in the order they are rendered. Components defined in the same file are opened, so you see what is inside them; `.map(…)` is a **×N** component; `cond && <X/>` and `cond ? <A/> : <B/>` give **R** conditions; a non-literal `disabled={…}` gives **D**; the data an item receives is shown. Plain HTML tags such as `div` are skipped.

A click on a component selects it; **Show in the inspector** opens it there (the inspector then has a **← Component tree** button to come back).

## Rearranging

Drag a box before, after or inside another one (left third, right third, middle), or use ⌥ + arrows on a selected box. The **Regenerate the screen (N changes)** button shows how many changes you made; **Reset** takes them back.

### What happens on Regenerate

1. The moves that are **safe** are made straight in the file: both components are plain children in the same function (before, after, inside, also between different parents). No agent is needed and no tokens are used.
2. **The screen on the canvas shows the result**, and a bar over the canvas asks you to **Keep** or **Undo** it. Undo restores the file; you can also use Edit → Undo.
3. Moves that cannot be made safely (a component in a condition or a list, a root of a component, a move into another function or into a component defined in the file) are sent to the agent **only after you press Keep**, with the reason for each. Claude then rebuilds the rest so that the structure matches yours.

**Plan a change…** in the dialog starts a plan for the screen.

## Why some moves are refused in the file

The file is a program, not only a tree: moving a component out of a list would break the variable the list gives it; moving it out of a condition changes when it is shown; moving it into another function changes what that function renders. The app only does what cannot change the behaviour, and hands everything else to Claude, which can adapt the code around it.
