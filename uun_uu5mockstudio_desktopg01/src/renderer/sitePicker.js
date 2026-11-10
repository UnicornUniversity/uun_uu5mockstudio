import { parseLink, kindLabel } from "./docLinks.js";
import { territoryDialog } from "./docCards.js";
import { mergeChildren, defaultChecked, pickToSitemap, pickOutline, findNode, idsBelow, countTree } from "./siteStructure.js";

/**
 * Sitemap from a link: the user gives the address of a web site, of a uuBookKit book or of a uuManagementKit document / portal, the app reads the
 * structure of its pages (main process: the MCP proxy for Plus4U, a hidden window for the web) and shows it as a tree with a tick at every page.
 * All or some pages are picked; a node whose own links are not read yet is unfolded on demand. The pick becomes the sitemap of the project
 * (`onUse`) or goes to the agent as the input of a sitemap plan (`onAgent`). Nothing is written to the source and no page content is loaded here.
 */
const MAX_PAGES = 200, MANY = 60, MAX_TREE = 800;
const GROUP = { nav: "menu", pages: "page", content: "link in the content", footer: "footer", sitemap: "sitemap.xml" };
const HINT = { bookkit: "the menu of the book", mkEcc: "the pages of the document, its navigation and the links of its content", web: "the menu of the site, the links of the page and its sitemap.xml" };

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n; };

export function openSitePicker({ studio = window.studio, toast = () => {}, url = "", replaces = false, useLabel = replaces ? "Replace the sitemap" : "Use as the sitemap", agentLabel = replaces ? "Hand to the agent to extend the sitemap" : "Hand to the agent", onUse, onAgent } = {}) {
  let state = "idle", error = "", tree = null, kind = null, source = "";
  const checked = new Set(), collapsed = new Set(), loading = new Set();

  const close = () => ov.remove();
  const input = el("input", { type: "url", className: "sp-url", value: url, placeholder: "https://… a web site, a uuBookKit book, a uuManagementKit document or portal", spellcheck: false, autocomplete: "off" });
  const loadBtn = el("button", { type: "button", className: "sp-load", textContent: "Load", onclick: () => load() });
  const body = el("div", { className: "sp-body" });
  const count = el("span", { className: "sp-count" });
  const useBtn = el("button", { type: "button", className: "primary", textContent: useLabel, title: replaces ? "The picked pages replace the sitemap of the project (the current one is kept and can be restored)" : "The picked pages become the sitemap of the project as they are", onclick: () => finish(onUse, false) });
  const agentBtn = el("button", { type: "button", textContent: agentLabel, title: replaces ? "The picked pages are attached to your next message: the agent goes through them and proposes how to extend or change the sitemap of the project; nothing is replaced until you approve it" : "The picked pages are attached to your next message in Plan mode: the agent proposes the sitemap from them and you approve it", onclick: () => finish(onAgent, true) });
  const head = el("h2", { textContent: "Sitemap from a link" });

  async function load({ login = false } = {}) {
    const doc = parseLink(input.value);
    if (!doc) { state = "error"; error = "Enter the address of a web site, of a uuBookKit book or of a uuManagementKit document (https://…)."; return paint(); }
    state = "loading"; error = login ? "Waiting for the sign-in in the browser…" : ""; kind = doc.kind; source = doc.url; tree = null; checked.clear(); collapsed.clear(); paint();
    if (login) { const l = await studio.docLogin(doc.url).catch((e) => ({ error: String(e?.message ?? e) })); if (!ov.isConnected) return; if (l?.error) { state = "error"; error = `The sign-in did not finish: ${l.error}`; return paint(); } error = ""; paint(); }
    const r = await studio.docStructure(doc.url).catch((e) => ({ error: String(e?.message ?? e) }));
    if (!ov.isConnected || source !== doc.url) return; // closed, or another address meanwhile
    if (r?.ok && r.tree) { state = "ready"; tree = r.tree; for (const id of defaultChecked(tree)) checked.add(id); for (const n of walk(tree)) if (n !== tree && n.children.length && countTree(tree) > 80) collapsed.add(n.id); }
    else if (["login", "territory", "npx"].includes(r?.error)) state = r.error;
    else { state = "error"; error = r?.error || "The structure could not be loaded."; }
    paint();
  }

  /** The links of one page are read when the user asks for them: its pages go below it, not ticked. */
  async function expand(n) {
    if (loading.has(n.id)) return;
    if (countTree(tree) >= MAX_TREE) return toast("The structure is already very large: pick from what is shown.", { err: true });
    loading.add(n.id); paint();
    const r = await studio.docStructure(n.url).catch((e) => ({ error: String(e?.message ?? e) }));
    loading.delete(n.id);
    if (!ov.isConnected || !tree || !findNode(tree, n.id)) return;
    if (r?.ok && r.tree) {
      const m = mergeChildren(tree, n.id, r.tree); tree = m.tree; collapsed.delete(n.id);
      if (!m.added.length) toast(`“${n.title}” links to no page that is not shown yet.`);
    } else toast(r?.error === "login" ? "Sign in to Plus4U first (load the address again)." : r?.error || "The pages could not be loaded.", { err: true });
    paint();
  }

  function* walk(n) { yield n; for (const c of n.children) yield* walk(c); }

  function toggle(n, only) {
    const ids = only ? [n.id] : idsBelow(n), all = ids.every((i) => checked.has(i));
    for (const i of ids) { if (all) checked.delete(i); else checked.add(i); }
    paint();
  }

  function row(n, top) {
    const below = idsBelow(n), on = below.filter((i) => checked.has(i)).length, folded = collapsed.has(n.id);
    const fold = n.children.length ? el("button", { type: "button", className: "sp-fold", textContent: folded ? "▸" : "▾", title: folded ? "Unfold" : "Fold", onclick: () => { if (folded) collapsed.delete(n.id); else collapsed.add(n.id); paint(); } }) : el("span", { className: "sp-fold" });
    fold.setAttribute?.("aria-label", folded ? `Unfold ${n.title}` : `Fold ${n.title}`);
    const cb = el("input", { type: "checkbox", checked: checked.has(n.id), indeterminate: on > 0 && on < below.length });
    cb.onclick = (e) => { e.preventDefault(); toggle(n, e.altKey); };
    const label = el("label", { className: "sp-label", title: n.url ?? "" }, cb, el("span", { className: "sp-title", textContent: n.title }),
      top ? el("small", { className: "sp-tag", textContent: kindLabel(n.kind) }) : n.group ? el("small", { className: `sp-tag g-${n.group}`, textContent: n.kind !== tree.kind ? `${GROUP[n.group] ?? n.group} · ${kindLabel(n.kind)}` : GROUP[n.group] ?? n.group }) : null,
      folded ? el("small", { className: "sp-more", textContent: `${below.length - 1} below` }) : null);
    const more = n.expandable && !top ? el("button", { type: "button", className: "sp-expand", disabled: loading.has(n.id), textContent: loading.has(n.id) ? "Loading…" : "Load its pages", title: "Reads the links of this page and puts the pages it leads to below it", onclick: () => expand(n) }) : null;
    const li = el("li", {}, el("div", { className: "sp-row" }, fold, label, more));
    if (n.children.length && !folded) li.append(el("ul", {}, ...n.children.map((c) => row(c, false))));
    return li;
  }

  /** A site that shows its menu and pages only to a signed-in user: sign in in a window of the app, then the structure is read again with that access. */
  const access = () => el("button", { type: "button", textContent: "Load with my access…", title: "Opens the site in a window of the app: sign in there and close the window. The structure is then read again as you see the site (menus and pages that need your permissions).", onclick: async () => { const r = await studio.docWebLogin(source).catch((e) => ({ error: String(e?.message ?? e) })); if (r?.error) return toast(r.error, { err: true }); if (ov.isConnected) load(); } });

  function paint() {
    const busy = state === "loading";
    loadBtn.disabled = busy; loadBtn.textContent = busy ? "Loading…" : tree ? "Reload" : "Load";
    head.textContent = tree ? tree.title : "Sitemap from a link";
    const parts = [];
    if (state === "idle") parts.push(el("p", { className: "mute", textContent: "Paste the address and press Load. The app reads the structure of the pages behind it (read-only): the menu of a book, the pages and the navigation of a document or portal, the menu of a web site. Then you pick the pages for the sitemap." }));
    else if (busy) parts.push(el("p", { className: "mute", textContent: error || `Reading ${HINT[kind] ?? "the structure"}…` }));
    else if (state === "login") parts.push(el("p", { textContent: "Sign in to Plus4U to read it." }), el("p", {}, el("button", { type: "button", className: "primary", textContent: "Sign in", onclick: () => load({ login: true }) })));
    else if (state === "territory") parts.push(el("p", { textContent: "Choose the uuAiChat server (territory) that reads Plus4U documents first." }), el("p", {}, el("button", { type: "button", className: "primary", textContent: "Choose the territory…", onclick: () => territoryDialog({ studio, toast, onSaved: () => load() }) })));
    else if (state === "npx") parts.push(el("p", { textContent: "Node.js (npx) was not found. Install Node.js to read Plus4U documents." }));
    else if (state === "error") parts.push(el("p", { className: "sp-err", textContent: error }), el("p", {}, el("button", { type: "button", textContent: "Retry", onclick: () => load() }), kind === "web" ? access() : null));
    else if (tree) {
      const all = idsBelow(tree);
      if (all.length === 1) parts.push(el("p", { className: "mute", textContent: kind === "web" ? "The page shows no link to another page of the same site. It may need a sign-in, or it draws its menu only after an action." : "No other page was found: the document has one page and no links." }));
      parts.push(el("div", { className: "sp-tools" },
        el("button", { type: "button", textContent: "Select all", onclick: () => { for (const i of all) checked.add(i); paint(); } }),
        el("button", { type: "button", textContent: "Select none", onclick: () => { checked.clear(); paint(); } }),
        kind === "web" ? access() : null,
        el("span", { className: "mute", textContent: `Read: ${HINT[kind] ?? ""}. A tick takes the page with all below it; Alt+click only the page itself.` })),
      el("ul", { className: "sp-tree" }, row(tree, true)));
    }
    body.replaceChildren(...parts);
    const n = checked.size;
    count.textContent = !tree ? "" : n > MAX_PAGES ? `${n} pages picked: a sitemap holds at most ${MAX_PAGES}` : n > MANY ? `${n} pages picked (a map of about ${MANY} pages is easier to work with)` : `${n} page${n === 1 ? "" : "s"} picked`;
    count.classList.toggle("warn", n > MANY);
    useBtn.disabled = agentBtn.disabled = !tree || !n || n > MAX_PAGES || busy;
  }

  async function finish(fn, agent) {
    if (!tree || !checked.size || !fn) return;
    const info = { url: source, kind, title: tree.title, count: checked.size };
    const ok = await fn(agent ? { ...info, outline: pickOutline(tree, checked) } : { ...info, sitemap: pickToSitemap(tree, checked) });
    if (ok !== false) close();
  }

  const ov = el("div", { className: "docprev", onclick: (e) => { if (e.target === ov) close(); } },
    el("div", { className: "card sitepick" },
      el("header", {}, el("div", {}, el("small", { textContent: "Pick the pages of the sitemap from an existing site, book or portal" }), head), el("button", { type: "button", textContent: "✕", title: "Close", onclick: close })),
      el("div", { className: "sp-bar" }, input, loadBtn),
      body,
      el("footer", {}, count, agentBtn, useBtn)));
  ov.tabIndex = -1;
  ov.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } if (e.key === "Enter" && e.target === input) { e.preventDefault(); load(); } });
  document.body.append(ov);
  paint();
  if (parseLink(url)) load(); else input.focus();
  return { close };
}
