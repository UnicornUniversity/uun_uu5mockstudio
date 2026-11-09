import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkScreen, fixPrompt, unspace, findColors, findLogoSizes, findFallbackFonts, draftGuide, fillGuide, importManual, GUIDE_TEMPLATE, readGuide, textPath, checkSource, saveSources, sourceStem, parseTokens, brandCss, injectBrand, offPaletteColors, extractCssVars, guidePrompt, distillPrompt, listSources } from "../src/main/brand.mjs";
import { memoryPrompt } from "../src/main/claudeService.mjs";

const b64 = (s) => Buffer.from(s).toString("base64");
const GUIDE = `# Design guide\n\n## Colours\n- primary: #0057B8 (main actions)\n- accent: #f60\n- bad: red\n- inject: #fff;}</style><script>\n\n## Typography\n- font-body: Inter, sans-serif\n- font-heading: "Fira Sans", Arial (titles)\n- size-base: 16px\n\n## Logo\n- clear: #123456\n`;

test("the content has to match the kind of the file", () => {
  assert.equal(checkSource("Manual.PDF", Buffer.from("%PDF-1.7\n...")), "pdf");
  assert.throws(() => checkSource("a.pdf", Buffer.from("<html>")), /not a valid PDF/);
  assert.throws(() => checkSource("a.exe", Buffer.from("x")), /Only PDF/);
  assert.throws(() => checkSource("a.md", Buffer.from([65, 0, 66])), /not a text file/);
  assert.throws(() => checkSource("a.md", Buffer.alloc(0)), /empty/);
  assert.equal(checkSource("a.htm", Buffer.from("<p>x")), "html");
});

test("sources are stored in the hidden folder, never overwritten, and validated as a whole", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-"));
  const r1 = await saveSources(dir, [{ name: "Brand Manual (v2).pdf", data: b64("%PDF-1.4 x") }]);
  assert.equal(path.relative(dir, r1[0].path), path.join(".studio", "brand", "source", "brand-manual-v2.pdf"));
  const r2 = await saveSources(dir, [{ name: "Brand Manual (v2).pdf", data: b64("%PDF-1.4 y") }]);
  assert.match(r2[0].path, /brand-manual-v2-2\.pdf$/);
  await assert.rejects(saveSources(dir, [{ name: "ok.md", data: b64("# hi") }, { name: "bad.pdf", data: b64("nope") }]), /not a valid PDF/);
  assert.equal((await listSources(dir)).length, 2, "the good one of a bad batch was not written");
  assert.equal(sourceStem("../Žluťoučký kůň.md"), "zlutoucky-kun");
});

test("tokens are read from Colours and Typography only and are sanitised", () => {
  const t = parseTokens(GUIDE);
  assert.deepEqual(t.colors.map((c) => `${c.name}=${c.value}`), ["primary=#0057b8", "accent=#f60", "inject=#fff"]);
  assert.deepEqual(t.fonts.map((f) => `${f.name}=${f.value}`), ["font-body=Inter, sans-serif", 'font-heading="Fira Sans", Arial']);
  const css = brandCss(GUIDE);
  assert.match(css, /^:root\{--brand-primary:#0057b8;--brand-accent:#f60;--brand-inject:#fff;--brand-font-body:Inter, sans-serif;/);
  assert.ok(!/[<>]/.test(css));
  assert.equal(brandCss("# nothing"), "");
});

test("the brand style is put before </head>, and an unchanged page stays unchanged without tokens", () => {
  assert.equal(injectBrand("<head></head><body>x</body>", ":root{--brand-a:#fff}"), "<head><style data-uu5mock-brand>:root{--brand-a:#fff}</style></head><body>x</body>");
  assert.equal(injectBrand("<p>x</p>", ""), "<p>x</p>");
});

test("colours of a screen outside the palette are reported (white, black and short forms aside)", () => {
  const g = "## Colours\n- primary: #0057B8\n- accent: #f60";
  assert.deepEqual(offPaletteColors('<div style="color:#0057b8;background:#FF6600;border:1px solid #ccc;fill:#fff">', g), ["#ccc"].map((c) => `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`));
  assert.deepEqual(offPaletteColors("<p style='color:#123'>", "# empty"), []);
});

test("CSS variables of an HTML manual become hints", () => {
  const v = extractCssVars(":root{--primary:#0057B8;--font:'Inter', sans-serif;--x:calc(1px + 2px);}");
  assert.deepEqual(v.map((x) => x.key), ["--primary", "--font"]);
});

test("the prompt carries the guide as data, names the variables and the sources; nothing without guide or sources", () => {
  assert.equal(guidePrompt({ cwd: "/p", guide: "", sources: [] }), "");
  const p = guidePrompt({ cwd: "/p", guide: GUIDE, sources: ["/p/.studio/brand/source/m.pdf"] });
  assert.match(p, /DESIGN_GUIDE\.md in \/p/); assert.match(p, /var\(--brand-primary\)/); assert.match(p, /<<<GUIDE\n# Design guide/); assert.match(p, /source\/m\.pdf/);
  const m = memoryPrompt({ cwd: "/p", rules: "", brandBlock: p });
  assert.ok(m.indexOf("DESIGN_GUIDE.md") > m.indexOf("RULES>>>") || m.includes("does not exist yet"));
  assert.ok(!/DESIGN_GUIDE/.test(memoryPrompt({ cwd: "/p", rules: "" })));
});

test("the distillation request lists the files and the structure of the guide", () => {
  const p = distillPrompt([{ path: "/p/.studio/brand/source/m.pdf", kind: "pdf" }], "/p");
  assert.match(p, /brand\/text\/m\.txt/); assert.match(p, /\/p\/DESIGN_GUIDE\.md/); assert.match(p, /## Colours/); assert.match(p, /\(assumed\)/);
});

const PAGE3 = ["B r a n d   c o l o u r s", "Blue Unicorn UNIVERSITY", "CMYK: 100/65/0/30", "RGB: 0/40/130", "Pantone: 281 C   /   288 U", "RAL: 5013", "Green Unicorn UNIVERSITY", "CMYK: 70/0/25/0", "RGB: 0/183/   198", "Pantone: 333 C   /   332 U", "RAL: 5021", "Black", "CMYK: 0/0/0/100", "RGB: 0/0/   0", "Grey Unicorn UNIVERSITY", "RGB: 125/125/   125", "RAL: –   –   –"].join("\n");

test("letter-spaced PDF headings are joined, normal text is kept", () => {
  assert.equal(unspace("B a s i c   v a r i a n t s   o f   t h e   m a r k"), "Basic variants of the mark");
  assert.equal(unspace("Blue Unicorn UNIVERSITY "), "Blue Unicorn UNIVERSITY");
});

test("colour blocks of a manual (name, CMYK, RGB, Pantone) become tokens with their print values", () => {
  const c = findColors([PAGE3]);
  assert.deepEqual(c.map((x) => `${x.name}=${x.hex}`), ["blue-unicorn-university=#002882", "green-unicorn-university=#00b7c6", "black=#000000", "grey-unicorn-university=#7d7d7d"]);
  assert.match(c[0].note, /CMYK: 100\/65\/0\/30; Pantone: 281 C\/288 U; RAL: 5013/);
  assert.ok(!/RAL/.test(c[3].note), "an empty RAL is dropped");
  assert.deepEqual(findColors(["Primary: #0057B8\nAccent = #f60"]).map((x) => x.hex), ["#0057b8", "#ff6600"]);
});

test("logo sizes and replacement fonts are found", () => {
  const sizes = findLogoSizes(["Smallest possible size of\nthe graphic mark: width 15 mm\nthe text"]);
  assert.match(sizes[0].text, /width 15 mm/);
  assert.deepEqual(findFallbackFonts(["Replacement fonts. In the event ...: ARIAL (all cuts), TIMES (all cuts)."]), ["Arial", "Times"]);
});

test("the draft fills only empty sections and keeps what was written by hand", () => {
  const draft = draftGuide({ colors: findColors([PAGE3]), fonts: ["Franklin Gothic URW"], fallbacks: ["Arial"], logoSizes: [], file: "m.pdf" });
  const md = fillGuide("", draft);
  assert.match(md, /- blue-unicorn-university: #002882 \(CMYK/); assert.match(md, /- font-body: "Franklin Gothic URW", Arial, sans-serif/);
  assert.equal(parseTokens(md).colors.length, 4); assert.equal(parseTokens(md).fonts.length, 2);
  const hand = fillGuide("## Colours\n- primary: #111111\n\n## Typography\n", draft);
  assert.deepEqual(parseTokens(hand).colors.map((c) => c.name), ["primary"]);
  assert.match(hand, /font-body/);
});

const REAL = "/Users/marekberanek/Documents/uu5Mock Studio/Unicorn university portal/.studio/brand/source/uun-gm-002-en-final.pdf";
test("a real PDF manual is read page by page and its colours reach the guide", { skip: !fs.existsSync(REAL) }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-pdf-"));
  fs.mkdirSync(path.join(dir, ".studio", "brand", "source"), { recursive: true });
  const f = path.join(dir, ".studio", "brand", "source", "m.pdf"); fs.copyFileSync(REAL, f);
  const seen = [];
  const r = await importManual(dir, f, (p) => seen.push(p));
  assert.equal(r.pages, 9); assert.ok(seen.some((p) => p.phase === "Reading page" && p.done === 9 && p.total === 9));
  assert.ok(r.colors.some((c) => c.hex === "#002882"));
  const guide = await readGuide(dir);
  assert.match(guide, /#002882/); assert.ok(fs.existsSync(textPath(f)));
  assert.equal((await listSources(dir)).length, 1, "the extracted text is not a source");
});

test("a screen is checked against the palette and fonts of the guide", () => {
  const g = "## Colours\n- primary: #0057B8\n- accent: #f60\n\n## Typography\n- font-body: Inter, Arial, sans-serif";
  const r = checkScreen('<style>.a{color:#0057b8;background:#e11;border:1px solid #ccc;font-family:"Comic Sans MS", sans-serif}.b{font-family:Inter}</style><script src="https://x/abc#123456"></script>', g);
  assert.deepEqual(r.off, ["#ee1111"]);
  assert.deepEqual(r.literals, [{ hex: "#0057b8", name: "primary" }]);
  assert.deepEqual(r.fonts, ["Comic Sans MS"]);
  assert.equal(checkScreen("<p>", "# nothing"), null);
  assert.match(fixPrompt("home.html", r, "/p"), /#ee1111.*var\(--brand-font-body\)/);
  const clean = checkScreen('<div style="color:var(--brand-primary)">', g);
  assert.deepEqual([clean.off, clean.fonts], [[], []]);
});
