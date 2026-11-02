import { snippetFor, CORE_IMPORTS } from "./componentSnippets.mjs";

/**
 * Preview of one library component for the catalogue: a small page with the snippet that would be dropped onto a screen, rendered with the same
 * runtime as the mockups. The libraries of CORE_IMPORTS are there on every page; the others are added to the page as `uu5DemoDependencies`
 * with their own import (PREVIEW_LIBS: namespace used in the component names -> [module, version]).
 */
export const PREVIEW_PREFIX = "/__preview/";

// the latest major of each library published on the CDN (found out by loading every library with 1.x, 2.x and 3.x)
export const PREVIEW_LIBS = {
  Uu5Calendar: ["uu5calendarg01", "2.x"], Uu5Charts: ["uu5chartsg01", "3.x"],
  Uu5Tiles: ["uu5tilesg02", "2.x"], Uu5TilesControls: ["uu5tilesg02-controls", "2.x"], Uu5TilesElements: ["uu5tilesg02-elements", "2.x"], Uu5TilesForms: ["uu5tilesg02-forms", "2.x"],
  Uu5Animation: ["uu5animationg01", "2.x"], Uu5AnimationElements: ["uu5animationg01-elements", "2.x"],
  Uu5CodeKit: ["uu5codekitg01", "2.x"], Uu5CodeKitForms: ["uu5codekitg01-forms", "2.x"],
  Uu5DnD: ["uu5dndg01", "1.x"], Uu5Editing: ["uu5editingg01", "1.x"], Uu5EditingForms: ["uu5editingg01-forms", "1.x"], Uu5EditingElements: ["uu5editingg01-elements", "1.x"],
  Uu5Extras: ["uu5extrasg01", "1.x"], Uu5ExtrasForms: ["uu5extrasg01-forms", "1.x"], Uu5Imaging: ["uu5imagingg01", "2.x"], Uu5Layout: ["uu5layoutg01", "1.x"],
  Uu5Maps: ["uu5mapsg01", "2.x"], Uu5MapsElements: ["uu5mapsg01-elements", "2.x"], Uu5Math: ["uu5mathg01", "3.x"], Uu5OpenLayers: ["uu5openlayersg01", "1.x"],
  Uu5RichText: ["uu5richtextg01", "3.x"], Uu5RichTextElements: ["uu5richtextg01-elements", "3.x"], Uu5RichTextForms: ["uu5richtextg01-forms", "3.x"],
  Uu5Tree: ["uu5treeg01", "3.x"], Uu5TreeElements: ["uu5treeg01-elements", "3.x"], UuI18n: ["uu_i18ng01", "1.x"],
  Plus4U5: ["uu_plus4u5g02", "1.x"], Plus4U5Elements: ["uu_plus4u5g02-elements", "1.x"],
};
// charts need data to show anything; these are only for the preview (a screen gets the generated snippet)
const PREVIEW_ONLY = {
  "Uu5Charts.PieChart": `<Uu5Charts.PieChart data={[{ name: "A", value: 40 }, { name: "B", value: 25 }, { name: "C", value: 35 }]} serieList={[{ valueKey: "value", labelKey: "name" }]} legend />`,
  "Uu5Charts.XyChart": `<Uu5Charts.XyChart data={[{ month: "Jan", sum: 12 }, { month: "Feb", sum: 18 }, { month: "Mar", sum: 9 }]} serieList={[{ valueKey: "sum", title: "Sum", bar: true }]} labelAxis={{ dataKey: "month" }} />`,
};
const known = (ns) => Boolean(CORE_IMPORTS[ns] || PREVIEW_LIBS[ns]);
const usedLibs = (text) => [...new Set([...text.matchAll(/<\/?((?:Uu5|Plus4U5|UuI18n)\w*)\./g)].map((m) => m[1]))];

// what cannot be seen on its own: layers that cover the page, buses and providers, the Alert (shows nothing outside of an AlertBus), the parts of a bigger component
const NOT_SHOWN = /(Bus|Provider|Modal|Dialog|Drawer|Popover|FloatingBox|UnhandledError|Wizard|Lsi)(\.|$)|^Uu5Elements\.Alert$|^Plus4U5App\.|\.(use|with)[A-Z]|^\w+\.\w+\.(?!Input$)\w+/; // also the parts of a bigger component (Date.Picker, Date.Field …), except the bare inputs (Radios.Input), which work on their own

/** The snippet to show, or null when the component has none or needs a library the page does not load. */
export function previewSnippet(name, docs) {
  if (typeof name !== "string" || !known(name.split(".")[0]) || NOT_SHOWN.test(name)) return null;
  const built = PREVIEW_ONLY[name] ? { snippet: PREVIEW_ONLY[name] } : snippetFor(name, docs);
  if (!built) return null;
  return usedLibs(built.snippet).every(known) ? built.snippet : null;
}

export const previewable = (name, docs) => previewSnippet(name, docs) !== null;

/** The HTML of the preview page, or null. A field (Uu5Forms.Form…) is put into a form, as it would be on a screen. */
export function previewPage(name, docs) {
  const snippet = previewSnippet(name, docs);
  if (!snippet) return null;
  const inForm = name.startsWith("Uu5Forms.") && name !== "Uu5Forms.Form";
  const extra = usedLibs(snippet).filter((l) => PREVIEW_LIBS[l]);
  const deps = JSON.stringify(Object.fromEntries(extra.map((l) => PREVIEW_LIBS[l])));
  // a library may export its components by name or in a default object; both are reachable as Lib.Component
  const imports = extra.map((l) => `import * as _${l} from "${PREVIEW_LIBS[l][0]}"; const ${l} = { ..._${l}, ...(_${l}.default || {}) };`).join("\n  ");
  const body = inForm ? `<Uu5Forms.Form>\n${snippet}\n</Uu5Forms.Form>` : snippet;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${name.replace(/[^\w.]/g, "")}</title>
<script src="https://cdn.plus4u.net/uu-uu5loaderg01/1.0.0/uu5loaderg01.min.js" crossorigin></script>
<script>var uu5DemoDependencies = ${deps};</script>
<script src="https://cdng02.plus4u.net/b686718ad49d3ec4d88936576cd830c2/uu-uu5g05/1.x/assets/example-config.js" crossorigin></script>
<style>.uu-app-devkit-demo-middleware-controls{display:none}body{margin:0}</style>
</head><body><div id="uu5"></div>
<script>window.addEventListener("error", () => { window.__pvErr = true; });</script>
<script type="text/babel">
  import { Utils, useState } from "uu5g05";
  import React from "react";
  import Uu5Elements from "uu5g05-elements";
  import Uu5Forms from "uu5g05-forms";
  ${imports}
  const note = (text) => <div data-pv-note style={{ padding: 16, font: "13px sans-serif", color: "#666" }}>{text}</div>;
  // a documented component may be missing from the published version of its library, or fail without its context: say so instead of a blank page
  class Guard extends React.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? note("This component cannot be shown on its own.") : this.props.children; }
  }
  const exists = ${JSON.stringify(name)}.split(".").reduce((o, k) => (o == null ? o : o[k]), { ${[...new Set(["Uu5Elements", "Uu5Forms", ...extra])].join(", ")} }) != null;
  function Page() {
    return exists ? <div style={{ padding: 16 }}>
${body}
    </div> : note("This component is not exported under this name by the published library.");
  }
  Utils.Dom.render(<Uu5Elements.AlertBus><Guard><Page /></Guard></Uu5Elements.AlertBus>, document.getElementById("uu5"));
</script></body></html>`;
}
