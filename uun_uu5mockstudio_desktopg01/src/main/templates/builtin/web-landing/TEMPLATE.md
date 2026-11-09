# Landing page

A web page that presents one offer and leads to one action. The starter file is a worked example: write the page the user asked for into the project folder under a name of its own, keep the structure where it fits and replace the sample content.

How to use it:
- Find out the offer, the audience and the one action the page leads to.
- Order: a short navigation with the action, hero, benefits, how it works (three steps), questions, a closing call to action, footer.
- No long menu: a landing page should not let the visitor wander off.

Rules of a Web page (a whole page of a web site, drawn full width, not a part of a document):
- The page carries its own frame: a navigation bar at the top (name, a few links, one button), the content and a footer. Never use a simulated Top, RouteHeader or an app shell.
- The look is plain HTML and CSS in the `<style>` of the file (className is fine here) with `Uu5Elements.Icon` for icons (names from the uugds skill). Do not use Uu5Elements.Block, Button or Forms: they look like an application, not a web site.
- Backgrounds: a document does not paint a `background` from the `style` or CSS of a div or Uu5Bricks.Card (it comes out white and white text disappears). A section, hero, panel or band with a gradient, a dark colour or a picture is a `Uu5Bricks.Background` (`gradient="linear-gradient(...)"`, `color="#hex"`, or `type="image"` with `src`; `borderRadius` for rounded corners; `margin=0` for a full-width band) with the content inside, and the library goes into uu5DemoDependencies (`uu5bricksg01: "1.x"`) and an `import Uu5Bricks from "uu5bricksg01"`. Light and translucent backgrounds may stay in CSS. Uu5Bricks.Card cannot take a colour: use it only for light cards. This is also what "Copy as uu5String" writes, so the document looks like the screen.
- Content first: write real headings, benefits and calls to action in the language of the user, not lorem ipsum. One main action per page, repeated in the header and at the end.
- Responsive: a grid with `repeat(auto-fit, minmax(...))` and one `@media (max-width: 800px)` rule that stacks the columns.
- Pictures: the `IMG + "02"` placeholders of the starter, or the pictures of the user (`assets/…`).
- Keep the head of the file (loader, config). No state is needed; a plain function component is enough.
