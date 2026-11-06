# Portal

A hub page that leads people to applications and documents. The starter file is a worked example: write the page the user asked for into the project folder under a name of its own (course-detail.html, not the starter's name), keep the head and the structure where they fit and replace the sample content.

How to use it:
- Ask (or decide) for whom the portal is and which applications, documents and contacts it offers.
- Keep one tile per destination (Uu5Bricks.Tile with href and target="_blank") in a Uu5Bricks.Layout of type tiles; group many tiles into several Sections.
- News go into a VerticalTimeline, people into an InfoGroup.

Rules of a Page (it ends up as uu5String in a document, see "Copy as uu5String"):
- Only components of the Bricks libraries (Uu5Bricks, Uu5RichTextBricks, Uu5ImagingBricks, Uu5ChartsBricks, Uu5TilesBricks, Uu5CodeKitBricks …) and plain HTML for text (p, strong, em, ul, ol, li, br, h2…h4 only where a Section does not fit).
- Look every component and prop up in the uu5bricks-knowledge skill before you use it (the Bricks have different props than Uu5Elements). Example: the colorScheme of Uu5Bricks.Background takes only the basic colours of uuGDS (blue, green, purple…, not primary or building); other looks come from its own props: color (hex), gradient (a CSS gradient, with background="soft" or "full" for the children), or type="image" / "video" with src.
- No state, no event handlers, no components of your own with logic, no className styling: none of it survives the uu5String. Data goes straight into props (arrays and objects are fine, they become uu5json).
- Keep the head of the file: a library you add needs its entry in uu5DemoDependencies and an `import * as Name from "package"` line (uu5bricksg01 1.x, uu5richtextg01-bricks 3.x, uu5imagingg01-bricks 2.x, uu5chartsg01-bricks 3.x, uu5tilesg02-bricks 2.x, uu5codekitg01-bricks 3.x).
- No simulated Top, no RouteHeader, no app shell: the document gives the frame. The width in the style of #uu5 is only for the preview.
- The portal lives in the uuManagementKit application. Its shell is fixed and drawn by the studio around your page when it is shown (Environment: uuManagementKit): the blue top bar, the left menu and the route header with the breadcrumb, the title and the buttons. You design only the content below the header. The title of the header is the `<title>` of the file (name it after the portal); parents of the breadcrumb come from an optional `<meta name="uu5mock:breadcrumb" content="Parent > Parent">`. Do not draw any of this yourself and do not start the content with a heading that repeats the title.
- Write real content in the language of the user, not lorem ipsum.
