# Home page

The starting page of a project, team or organisation. The starter file is a worked example: write the page the user asked for into the project folder under a name of its own (course-detail.html, not the starter's name), keep the head and the structure where they fit and replace the sample content.

How to use it:
- Find out the subject, its key facts (owner, phase, dates, size), the current announcement, the links people need and the milestones.
- Key facts go into the InfoGroup under the title, the announcement into the HighlightedBox, groups of links into Blocks in a Layout.

Rules of a Page (it ends up as uu5String in a document, see "Copy as uu5String"):
- Only components of the Bricks libraries (Uu5Bricks, Uu5RichTextBricks, Uu5ImagingBricks, Uu5ChartsBricks, Uu5TilesBricks, Uu5CodeKitBricks …) and plain HTML for text (p, strong, em, ul, ol, li, br, h2…h4 only where a Section does not fit).
- Look every component and prop up in the uu5bricks-knowledge skill before you use it (the Bricks have different props than Uu5Elements). Example: the colorScheme of Uu5Bricks.Background takes only the basic colours of uuGDS (blue, green, purple…, not primary or building); other looks come from its own props: color (hex), gradient (a CSS gradient, with background="soft" or "full" for the children), or type="image" / "video" with src.
- No state, no event handlers, no components of your own with logic, no className styling: none of it survives the uu5String. Data goes straight into props (arrays and objects are fine, they become uu5json).
- Keep the head of the file: a library you add needs its entry in uu5DemoDependencies and an `import * as Name from "package"` line (uu5bricksg01 1.x, uu5richtextg01-bricks 3.x, uu5imagingg01-bricks 2.x, uu5chartsg01-bricks 3.x, uu5tilesg02-bricks 2.x, uu5codekitg01-bricks 3.x).
- No simulated Top, no RouteHeader, no app shell: the document gives the frame. The width in the style of #uu5 is only for the preview.
- Write real content in the language of the user, not lorem ipsum.
