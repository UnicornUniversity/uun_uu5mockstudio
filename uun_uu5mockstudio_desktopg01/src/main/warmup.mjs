const BOOT = (deps) => `<!doctype html><html><head><meta charset="utf-8"><title>warmup</title>
<script src="https://cdn.plus4u.net/uu-uu5loaderg01/1.0.0/uu5loaderg01.min.js" crossorigin></script>
<script>var uu5DemoDependencies = ${JSON.stringify(deps)};</script>
<script src="https://cdng02.plus4u.net/b686718ad49d3ec4d88936576cd830c2/uu-uu5g05/1.x/assets/example-config.js" crossorigin></script>
</head><body><div id="uu5"></div>`;

/** Library groups a mockup may use. Each group is loaded as its own page so one failing library does not hide the rest. */
export const WARMUP_GROUPS = [
  { name: "core + forms", deps: {}, imports: `import Uu5Elements from "uu5g05-elements"; import Uu5Forms from "uu5g05-forms";`, use: "Uu5Elements, Uu5Forms" },
  { name: "tiles", deps: { uu5tilesg02: "2.x", "uu5tilesg02-controls": "2.x", "uu5tilesg02-elements": "2.x" },
    imports: `import Uu5Tiles from "uu5tilesg02"; import Uu5TilesControls from "uu5tilesg02-controls"; import Uu5TilesElements from "uu5tilesg02-elements";`, use: "Uu5Tiles, Uu5TilesControls, Uu5TilesElements" },
  { name: "charts", deps: { uu5chartsg01: "3.x" }, imports: `import { PieChart, XyChart } from "uu5chartsg01";`, use: "PieChart, XyChart" },
  { name: "plus4u5", deps: { uu_plus4u5g02: "1.x", "uu_plus4u5g02-app": "1.x" },
    imports: `import Plus4U5 from "uu_plus4u5g02"; import Plus4U5App from "uu_plus4u5g02-app";`, use: "Plus4U5, Plus4U5App" },
];

export const warmupPage = (g) => BOOT(g.deps) + `
<script type="text/babel">
  import { Utils } from "uu5g05";
  ${g.imports}
  const used = [${g.use}];
  Utils.Dom.render(<div>ok {used.length}</div>, document.getElementById("uu5"));
</script></body></html>`;
