/**
 * No flicker while a screen is rendered again (the file changed by the agent or the inspector, a reload): the webview shows the page
 * as soon as it starts to load, so for the time of the load it is covered by a picture of the last good render. The cover is taken
 * off when the new page has loaded and its content has stopped changing (the libraries come from the CDN and the page renders after
 * the load). The scroll position of the page is put back. Without a picture (never rendered, or it could not be taken) nothing is covered.
 * `view` is the <webview>, `host` the element that contains it (positioned).
 */
const SNAP_TIMEOUT = 1500, POLL = 250, GIVE_UP_BLANK = 3000, GIVE_UP = 12000;
const STATE = "(() => { const b = document.body; return b ? JSON.stringify([b.innerText.trim().length, document.documentElement.scrollHeight, b.getElementsByTagName('*').length]) : null; })()";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bounded = (p, ms) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); }); });

/**
 * Waits until the page of `view` has content that has stopped changing (a page that stays empty is given up after a few seconds).
 * Resolves { hasContent }, or null when `cancelled()` became true. Shared by the cover and by the swap of a screen (canvas.js).
 */
export async function waitSettled(view, cancelled = () => false) {
  const started = Date.now();
  let last = null, stable = 0, hasContent = false;
  while (!cancelled()) {
    await sleep(POLL);
    if (cancelled()) return null;
    const s = await bounded(view.executeJavaScript(STATE), 1500), waited = Date.now() - started;
    const blank = !s || JSON.parse(s)[0] === 0;
    if (!blank) hasContent = true;
    if (!blank && s === last) stable++; else stable = 0;
    last = s;
    if (stable >= 2) break;
    if (blank && waited > GIVE_UP_BLANK) break; // a page that stays empty (an error): do not wait for it
    if (waited > GIVE_UP) break;
  }
  return cancelled() ? null : { hasContent };
}

export function attachFreeze(view, host) {
  let snap = null, cover = null, token = 0, scroll = null;

  const withTimeout = (p, ms) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); }); });
  const run = (code) => withTimeout(view.executeJavaScript(code), 1500);

  // The picture is decoded in advance (`snap` is a ready <img>): decoding a big picture when the cover is put on takes long enough
  // for the white page underneath to show through, which is exactly the flicker this is meant to remove.
  function show() {
    if (cover || !snap) return;
    cover = snap; cover.classList.remove("out");
    host.append(cover);
  }
  function hide() {
    if (!cover) return;
    const c = cover; cover = null;
    c.classList.add("out"); setTimeout(() => { if (c !== cover) c.remove(); }, 200);
  }
  async function capture() {
    const img = await withTimeout(view.capturePage?.(), SNAP_TIMEOUT);
    if (!img || img.isEmpty?.()) return;
    let url; try { url = img.toDataURL(); } catch { return; }
    const el = Object.assign(new Image(), { className: "freeze-cover", alt: "", draggable: false });
    el.src = url;
    try { await el.decode(); } catch { return; }
    snap = el;
  }

  /** After a load: wait until the page has content that stops changing, then restore the scroll, take a new picture and uncover. */
  async function settle(my) {
    const r = await waitSettled(view, () => my !== token);
    if (!r || my !== token) return;
    if (scroll && (scroll[0] || scroll[1])) await run(`window.scrollTo(${Number(scroll[0]) || 0}, ${Number(scroll[1]) || 0})`);
    scroll = null;
    await new Promise((res) => setTimeout(res, 150)); // the webview paints the new content a moment after the DOM has settled
    if (my !== token) return;
    hide();
    if (r.hasContent) await capture(); // a blank page (an error, a page still empty) never replaces the last good picture
  }

  // Only a real navigation of the main frame starts a cycle: the page may also report "loading" for navigations inside itself (a router
  // changing the address, a redirect), and those must neither cover the page nor cancel the wait for the render.
  let pending = false, safety = null;
  async function begin() {
    const my = ++token; pending = true; clearTimeout(safety);
    if (snap) { show(); const s = await run("[window.scrollX, window.scrollY]"); if (my === token && Array.isArray(s)) scroll = s; } // best effort: the old page may be gone already
    safety = setTimeout(() => { if (my === token && pending) { pending = false; hide(); } }, GIVE_UP + 8000); // a load that never ends must not keep the picture forever
  }
  view.addEventListener("did-start-navigation", (e) => { if (e.isMainFrame && !e.isInPlace) begin(); });
  view.addEventListener("did-stop-loading", () => { if (!pending) return; pending = false; clearTimeout(safety); settle(token); });
  view.addEventListener("did-fail-load", (e) => { if (e.errorCode === -3 || e.isMainFrame === false) return; token++; pending = false; clearTimeout(safety); hide(); }); // -3: a load that was replaced by a newer one
  return {
    /** Takes a picture of the page as it is now (a page that has been shown without a load of its own). */
    prime: capture,
    /** Covers the page right away (before the reload is asked for); taken off again if no navigation follows. */
    cover() { if (!snap) return; show(); clearTimeout(safety); const my = token; safety = setTimeout(() => { if (my === token && !pending) hide(); }, 4000); },
    destroy() { token++; clearTimeout(safety); cover?.remove(); snap?.remove(); cover = null; snap = null; },
  };
}
