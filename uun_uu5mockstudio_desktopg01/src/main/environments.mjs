/**
 * Environments of a Page: what a content page is shown in. A page is only the content (uu5Bricks that end up as uu5String in a document);
 * the environment is drawn around it when the preview server serves the page (`?env=<id>`), never written into the file. So the export of
 * an image shows it, while "Copy as uu5String" and the agent's files stay clean.
 *   none               the content alone
 *   managementkit      the shell of uuManagementKit, simulated: top bar, left menu, route header (breadcrumb, title, buttons) - all fixed
 */

export const ENVIRONMENTS = [
  { id: "none", label: "Content only" },
  { id: "managementkit", label: "uuManagementKit" },
];
export const DEFAULT_ENVIRONMENT = "none";
export const LOGO_URL = "https://cdn.plus4u.net/uun-decorationg01/1.0.0/assets/icon.svg";

export const isEnvironment = (id) => ENVIRONMENTS.some((e) => e.id === id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Title and breadcrumb of the page: its <title>, and the parents from `<meta name="uu5mock:breadcrumb" content="Parent > Parent">`. */
export function pageHead(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || "Page";
  const crumbs = /<meta\s+name=["']uu5mock:breadcrumb["']\s+content=["']([^"']*)["']/i.exec(html)?.[1];
  return { title, parents: crumbs ? crumbs.split(">").map((s) => s.trim()).filter(Boolean) : [] };
}

const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const MENU = [
  svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
  svg('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>'),
  svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'),
];
const CARET = svg('<polyline points="6 9 12 15 18 9"/>').replace('width="20" height="20"', 'width="12" height="12"');

const CSS = `
html{--mk-top:56px;--mk-side:58px}
html,body{background:#fff!important} /* the content of uuManagementKit lies on white, whatever background the page gave its body */
body{padding:var(--mk-top) 0 0 var(--mk-side)!important;margin:0!important;box-sizing:border-box}
#uu5{max-width:none!important;margin:0!important;padding:8px 24px 24px!important}
[data-uu5mock-shell]{pointer-events:none;font:14px/1.4 Roboto,"Segoe UI",system-ui,sans-serif;box-sizing:border-box}
[data-uu5mock-shell] *{box-sizing:border-box}
.mk-top{position:fixed;z-index:2147483000;top:0;left:0;right:0;height:var(--mk-top);background:#0b3a8f;color:#fff;display:flex;align-items:center;padding:0 16px 0 10px;gap:16px;font-weight:500}
.mk-top img{width:36px;height:36px}.mk-top .mk-name{font-size:16px;flex:1}.mk-top .mk-lang{font-size:13px}
.mk-top .mk-4u{background:#5cb85c;border-radius:6px;padding:4px 12px;font-weight:700;font-size:18px}
.mk-side{position:fixed;z-index:2147482999;top:var(--mk-top);left:0;bottom:0;width:var(--mk-side);background:#fff;border-right:1px solid #e0e0e0;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:10px;color:#444}
.mk-side .mk-avatar{width:36px;height:36px;border-radius:50%;background:#e5c9a8;margin-bottom:6px}
.mk-side .mk-i{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center}.mk-side .mk-i.on{background:#dbeafe;color:#1d5fbf}
.mk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 24px 4px;flex-wrap:wrap}
.mk-crumbs{font-size:12px;color:#1d6fd0}.mk-crumbs span+span:before{content:"›";margin:0 6px;color:#888}
.mk-title{font-size:26px;font-weight:500;color:#222;margin:4px 0 0}
.mk-act{display:flex;align-items:center;gap:20px;color:#555;font-size:14px;padding-top:6px}
.mk-act .mk-b{display:inline-flex;align-items:center;gap:6px}
.mk-act .mk-explore{background:#f0f0f0;color:#222;border-radius:6px;padding:8px 14px}
.mk-dot{width:18px;height:18px;border:3px solid #e0245e;border-radius:50%}
@media (max-width:600px){html{--mk-side:0px}.mk-side{display:none}.mk-act{display:none}.mk-head{padding:10px 16px 0}.mk-title{font-size:22px}#uu5{padding:8px 16px 16px!important}}
`;

/** The shell of uuManagementKit as markup. */
export function shellHtml({ title, parents }) {
  const crumbs = ["…", ...parents, title].map((c) => `<span>${esc(c)}</span>`).join("");
  const top = `<div class="mk-top" data-uu5mock-shell><img src="${LOGO_URL}" alt="" /><span class="mk-name">Unicorn University</span><span class="mk-lang">CS</span><span class="mk-4u">+4U</span></div>`;
  return `<style data-uu5mock-shell>${CSS}</style>${top}
<div class="mk-side" data-uu5mock-shell><div class="mk-avatar"></div>${MENU.map((m, i) => `<div class="mk-i${i === 0 ? " on" : ""}">${m}</div>`).join("")}</div>
<div class="mk-head" data-uu5mock-shell><div><div class="mk-crumbs">${crumbs}</div><h1 class="mk-title">${esc(title)}</h1></div>
<div class="mk-act"><span class="mk-b">Stránka ${CARET}</span><span class="mk-b">Dokument ${CARET}</span><span class="mk-b">0</span><span class="mk-b">0</span><span class="mk-b mk-explore">Prozkoumat</span><span class="mk-dot"></span></div></div>`;
}

/** The page served with an environment around it; `html` unchanged for "none" or an unknown id. */
export function wrapPage(html, env) {
  if (env !== "managementkit") return html;
  const shell = shellHtml(pageHead(html));
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + shell) : shell + html;
}
