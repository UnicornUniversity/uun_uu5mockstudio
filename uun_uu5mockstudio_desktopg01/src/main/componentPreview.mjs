import { snippetFor, CORE_IMPORTS } from "./componentSnippets.mjs";

/**
 * Preview of one library component for the catalogue: a small page with the snippet that would be dropped onto a screen, rendered with the same
 * runtime as the mockups. Only the libraries that every mockup can import (CORE_IMPORTS) are shown; the others would need their own dependencies.
 */
export const PREVIEW_PREFIX = "/__preview/";

// what cannot be seen on its own: layers that cover the page, buses and providers, the Alert (shows nothing outside of an AlertBus), the parts of a bigger component
const NOT_SHOWN = /(Bus|Provider|Modal|Dialog|Drawer|Popover|FloatingBox|UnhandledError|Wizard|Lsi)(\.|$)|^Uu5Elements\.Alert$|\.(use|with)[A-Z]|^\w+\.\w+\.(?!Input$)\w+/; // also the parts of a bigger component (Date.Picker, Date.Field …), except the bare inputs (Radios.Input), which work on their own

/** The snippet to show, or null when the component has none or needs a library the page does not load. */
export function previewSnippet(name, docs) {
  if (typeof name !== "string" || !CORE_IMPORTS[name.split(".")[0]] || NOT_SHOWN.test(name)) return null;
  const built = snippetFor(name, docs);
  if (!built) return null;
  const libs = [...built.snippet.matchAll(/<\/?((?:Uu5|Plus4U5)\w*)\./g)].map((m) => m[1]);
  return libs.every((l) => CORE_IMPORTS[l]) ? built.snippet : null;
}

export const previewable = (name, docs) => previewSnippet(name, docs) !== null;

/** The HTML of the preview page, or null. A field (Uu5Forms.Form…) is put into a form, as it would be on a screen. */
export function previewPage(name, docs) {
  const snippet = previewSnippet(name, docs);
  if (!snippet) return null;
  const inForm = name.startsWith("Uu5Forms.") && name !== "Uu5Forms.Form";
  const body = inForm ? `<Uu5Forms.Form>\n${snippet}\n</Uu5Forms.Form>` : snippet;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${name.replace(/[^\w.]/g, "")}</title>
<script src="https://cdn.plus4u.net/uu-uu5loaderg01/1.0.0/uu5loaderg01.min.js" crossorigin></script>
<script>var uu5DemoDependencies = {};</script>
<script src="https://cdng02.plus4u.net/b686718ad49d3ec4d88936576cd830c2/uu-uu5g05/1.x/assets/example-config.js" crossorigin></script>
<style>.uu-app-devkit-demo-middleware-controls{display:none}body{margin:0}</style>
</head><body><div id="uu5"></div>
<script type="text/babel">
  import { Utils, useState } from "uu5g05";
  import Uu5Elements from "uu5g05-elements";
  import Uu5Forms from "uu5g05-forms";
  function Page() {
    return <div style={{ padding: 16 }}>
${body}
    </div>;
  }
  Utils.Dom.render(<Uu5Elements.AlertBus><Page /></Uu5Elements.AlertBus>, document.getElementById("uu5"));
</script></body></html>`;
}
