# Web page

A standard content page of a web site (a subpage). The starter file is a worked example: write the page the user asked for into the project folder under a name of its own, keep the structure where it fits and replace the sample content.

How to use it:
- Find out what the page says and who reads it; keep one topic per page.
- Order: navigation, breadcrumb, title and lead, text in sections with a picture, a side column (links of the section, a contact), footer.
- Write text in short paragraphs under clear sub-headings.

Rules of a Web page (a whole page of a web site, drawn full width, not a part of a document):
- The page carries its own frame: a navigation bar at the top (name, a few links, one button), the content and a footer. Never use a simulated Top, RouteHeader or an app shell.
- The look is plain HTML and CSS in the `<style>` of the file (className is fine here) with `Uu5Elements.Icon` for icons (names from the uugds skill). Do not use Uu5Elements.Block, Button or Forms: they look like an application, not a web site.
- Content first: write real headings, benefits and calls to action in the language of the user, not lorem ipsum. One main action per page, repeated in the header and at the end.
- Responsive: a grid with `repeat(auto-fit, minmax(...))` and one `@media (max-width: 800px)` rule that stacks the columns.
- Pictures: the `IMG + "02"` placeholders of the starter, or the pictures of the user (`assets/…`).
- Keep the head of the file (loader, config). No state is needed; a plain function component is enough.
