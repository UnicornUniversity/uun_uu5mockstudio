/**
 * Frame capture from a live page. Two scripts run in the page of the preview window:
 *   PICKER   hover highlights an element, a click chooses it as the content slot (the part that stays the page's content), Esc/another click re-chooses;
 *            the choice is announced with console.log("__uu5mock_slot__")
 *   EXTRACT  flattens everything outside the slot into absolutely placed boxes (position, size, colours, borders, font, own text, pictures, svg),
 *            so the shell looks the same without the layout of the original page. Returns { html, css, offset, width, height }.
 * The result is a draft that Claude then tidies up (variables {{title}}, {{breadcrumb}}, repeated menu items) together with the user.
 */

export const SLOT_MESSAGE = "__uu5mock_slot__";
export const SAVE_MESSAGE = "__uu5mock_frame_save__";

export const PICKER = `(() => {
  if (window.__uu5mockPicker) return; window.__uu5mockPicker = true;
  const box = document.createElement("div"); box.id = "__uu5mock_hl";
  box.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #1976d2;background:rgba(25,118,210,.18);display:none";
  const bar = document.createElement("div"); bar.id = "__uu5mock_bar";
  bar.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:420px;padding:10px 14px;border-radius:10px;background:#1b1b1b;color:#fff;font:14px/1.4 system-ui;box-shadow:0 2px 10px rgba(0,0,0,.4)";
  const btn = 'padding:8px 14px;border:0;border-radius:8px;color:#fff;font:600 14px system-ui;cursor:pointer;margin:8px 8px 0 0';
  bar.innerHTML = '<div id="__uu5mock_msg"></div><button id="__uu5mock_mode" style="' + btn + ';background:#455a64"></button><button id="__uu5mock_add" title="Choose another part: the content area is the smallest rectangle around all the parts (Shift + click does it too)" style="' + btn + ';background:#455a64">＋ Add part</button><button id="__uu5mock_up" title="Larger area (wheel up, arrow up)" style="' + btn + ';background:#455a64">▲ Larger</button><button id="__uu5mock_use" title="Choose the highlighted area (Enter)" style="' + btn + ';background:#2e7d32">✓ Use this</button><button id="__uu5mock_down" title="Smaller area (wheel down, arrow down)" style="' + btn + ';background:#455a64">▼ Smaller</button><button id="__uu5mock_ok" disabled style="' + btn + ';background:#1976d2;opacity:.5">Save as frame</button>';
  document.documentElement.append(box, bar);
  const $ = (id) => document.getElementById(id);
  // parts = what was chosen: { el } (an element) or { rect } (a drawn rectangle); the content area is the smallest rectangle around all of them
  let pick = false, multi = false, hover = null, base = null, up = 0, drag = null, moved = false, dragged = false;
  const parts = [], marks = [];
  window.__uu5mockRect = null; window.__uu5mockRects = [];
  const mine = (el) => el && (el === box || bar.contains(el));
  // a drawn rectangle is kept in the coordinates of the page, so that it scrolls with the page it was drawn on
  const view = (r) => ({ left: r.left - scrollX, top: r.top - scrollY, right: r.right - scrollX, bottom: r.bottom - scrollY });
  const doc = (r) => ({ left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY });
  const rectOf = (p) => (p.el ? p.el.getBoundingClientRect() : view(p.rect));
  const paint = () => { if (window.__uu5mockDone) return; // (the extraction has taken the picker down)
    // the chosen parts in green, with a dashed line round them all when there are more
    window.__uu5mockRects = parts.filter((p) => p.rect).map((p) => p.rect); // in the coordinates of the page: the extraction takes them from the top of the page
    marks.splice(0).forEach((m) => m.remove());
    if (!parts.length) return;
    const rs = parts.map(rectOf);
    const mk = (r, css) => { const d = document.createElement("div"); d.className = "__uu5mock_mark"; d.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;" + css; Object.assign(d.style, { left: r.left + "px", top: r.top + "px", width: (r.right - r.left) + "px", height: (r.bottom - r.top) + "px" }); document.documentElement.append(d); marks.push(d); };
    if (rs.length > 1) mk({ left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) }, "border:2px dashed #2e7d32");
    for (const r of rs) mk(r, "border:2px solid #2e7d32;background:rgba(46,125,50,.18)");
  };
  const sync = () => { // what the extraction reads: the marked elements and the drawn rectangles
    document.querySelectorAll("[data-uu5mock-slot]").forEach((x) => x.removeAttribute("data-uu5mock-slot"));
    for (const p of parts) if (p.el) p.el.setAttribute("data-uu5mock-slot", "");
    paint(); ui();
    if (parts.length) console.log("${SLOT_MESSAGE}");
  };
  const lbl = document.createElement("div"); lbl.style.cssText = "position:fixed;z-index:2147483647;top:8px;left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:6px;background:#1b1b1b;color:#fff;font:12px/1.3 system-ui;pointer-events:none;display:none"; document.documentElement.append(lbl);
  const show = (el) => { const r = el.getBoundingClientRect(); Object.assign(box.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }); const tag = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/)[0] : ""); lbl.textContent = tag + "  " + Math.round(r.width) + "×" + Math.round(r.height); lbl.style.display = pick ? "block" : "none"; };
  // the element under the mouse, or its ancestor "up" levels higher (the whole white area under a header is rarely what lies directly under the pointer)
  const current = () => { let el = base; for (let i = 0; i < up && el.parentElement && el.parentElement !== document.documentElement; i++) el = el.parentElement; return el; };
  const move = (d) => { if (!base) return; up = Math.max(0, up + d); const el = current(); const cap = (() => { let e = base, n = 0; while (e.parentElement && e.parentElement !== document.documentElement) { e = e.parentElement; n++; } return n; })(); if (up > cap) up = cap; hover = current(); show(hover); };
  function ui() {
    const chosen = parts.length > 0;
    for (const id of ["__uu5mock_up", "__uu5mock_down", "__uu5mock_use"]) $(id).style.display = pick ? "inline-block" : "none";
    $("__uu5mock_add").style.display = !pick && chosen ? "inline-block" : "none";
    $("__uu5mock_mode").textContent = pick ? "Back to browsing" : (chosen ? "Choose again" : "Choose content area");
    $("__uu5mock_msg").textContent = pick ? "Click an element (wheel or ▲ ▼ make it larger or smaller; the label above shows its size), or drag a rectangle over the area where the content goes. Hold Shift to add more parts: the content area is the smallest rectangle around all of them" + (parts.length ? " (" + parts.length + " chosen so far; Enter or a click without Shift finishes)." : ".") : chosen ? (parts.length > 1 ? parts.length + " parts chosen: the content area is the rectangle around them all. Save it, add a part, or choose again." : "Content area chosen. Save it, add another part, or choose again.") : "Browse and sign in as needed. Open the page you want, then choose the content area.";
    const ok = $("__uu5mock_ok"); ok.disabled = !chosen; ok.style.opacity = chosen ? "1" : ".5";
    if (!pick) { lbl.style.display = "none"; box.style.display = "none"; }
  }
  $("__uu5mock_mode").onclick = () => { pick = !pick; if (pick) { multi = false; if (parts.length) { parts.length = 0; sync(); } } ui(); };
  $("__uu5mock_add").onclick = () => { pick = true; multi = true; ui(); };
  addEventListener("scroll", paint, true); addEventListener("resize", paint);
  addEventListener("mousemove", (e) => {
    if (pick && drag && e.buttons) { if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 8) moved = true; if (moved) { const l = Math.min(drag.x, e.clientX), t = Math.min(drag.y, e.clientY), w = Math.abs(e.clientX - drag.x), h = Math.abs(e.clientY - drag.y); Object.assign(box.style, { display: "block", left: l + "px", top: t + "px", width: w + "px", height: h + "px" }); lbl.textContent = "area  " + Math.round(w) + "×" + Math.round(h); lbl.style.display = "block"; } return; }
    if (!pick) return; const el = document.elementFromPoint(e.clientX, e.clientY); if (el && !mine(el) && el !== base) { base = el; up = 0; hover = el; show(el); } }, true);
  $("__uu5mock_up").onclick = () => move(1); $("__uu5mock_down").onclick = () => move(-1);
  addEventListener("wheel", (e) => { if (!pick || mine(e.target)) return; e.preventDefault(); e.stopPropagation(); move(e.deltaY < 0 ? 1 : -1); }, { capture: true, passive: false });
  // a part is chosen: with Shift it is added (or taken away again when it is there) and the choosing goes on; without Shift it ends the choosing
  // (it replaces what was chosen, unless parts were being added: then it is the last one)
  const addPart = (part, more) => {
    if (!more && !multi) parts.length = 0;
    const at = parts.findIndex((p) => (part.el ? p.el === part.el : false));
    if (at >= 0) { if (more) parts.splice(at, 1); } else parts.push(part);
    if (more) multi = true; else pick = false;
    sync();
  };
  const chooseEl = (more) => { if (hover) addPart({ el: hover }, more); };
  $("__uu5mock_use").onclick = () => chooseEl(false);
  addEventListener("click", (e) => {
    if (!pick || mine(e.target)) return; // browsing: clicks reach the page (sign-in, menus)
    if (dragged) { dragged = false; e.preventDefault(); e.stopPropagation(); return; } // the click that ends a drag
    e.preventDefault(); e.stopPropagation();
    chooseEl(e.shiftKey);
  }, true);
  addEventListener("mousedown", (e) => { if (pick && !mine(e.target)) { drag = { x: e.clientX, y: e.clientY }; moved = false; e.preventDefault(); e.stopPropagation(); } }, true);
  addEventListener("mouseup", (e) => {
    if (!pick || mine(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (drag && moved) { // a drawn rectangle is a part
      const l = Math.min(drag.x, e.clientX), t = Math.min(drag.y, e.clientY), r = Math.max(drag.x, e.clientX), b = Math.max(drag.y, e.clientY);
      dragged = true; addPart({ rect: doc({ left: l, top: t, right: r, bottom: b }) }, e.shiftKey);
    }
    drag = null; moved = false;
  }, true);
  for (const t of ["pointerdown", "pointerup"]) addEventListener(t, (e) => { if (pick && !mine(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
  addEventListener("keydown", (e) => { if (!pick) return; if (e.key === "Escape") { pick = false; ui(); } else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (hover) chooseEl(e.shiftKey); else if (parts.length) { pick = false; ui(); } } else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); move(e.key === "ArrowUp" ? 1 : -1); } }, true);
  $("__uu5mock_ok").onclick = () => console.log("${SAVE_MESSAGE}");
  ui();
  // editing a frame: the area it has now is chosen from the start (offsets from the edges of the window)
  const pre = window.__uu5mockPreset;
  if (pre) {
    const l = pre.left, t = pre.top, r = innerWidth - pre.right, b = pre.bottom ? innerHeight - pre.bottom : innerHeight;
    parts.push({ rect: doc({ left: l, top: t, right: r, bottom: b }) }); sync();
    $("__uu5mock_msg").textContent = "The area the frame has now is chosen. Save to keep it, add a part, or choose again.";
  }
})()`;

export const EXTRACT = `(async () => {
  const slots = [], drawn0 = window.__uu5mockRects ?? [];
  if (!document.querySelector("[data-uu5mock-slot]") && !drawn0.length) return null;
  window.__uu5mockDone = true; document.getElementById("__uu5mock_hl")?.remove(); document.getElementById("__uu5mock_bar")?.remove(); document.querySelectorAll(".__uu5mock_mark").forEach((x) => x.remove());
  // the frame is the page as it is at its top: a part chosen after scrolling down must not make what was scrolled out of the window (a header) drop out of the frame
  if (scrollX || scrollY) { scrollTo(0, 0); await new Promise((r) => setTimeout(r, 250)); }
  slots.push(...document.querySelectorAll("[data-uu5mock-slot]"));
  const drawn = drawn0.map((d) => ({ left: d.left - scrollX, top: d.top - scrollY, right: d.right - scrollX, bottom: d.bottom - scrollY }));
  const vw = innerWidth, vh = innerHeight, pageBottom = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0) - scrollY;
  // the content area: the smallest rectangle around all the parts chosen (elements and drawn rectangles); a rectangle that reaches the bottom of the window means "to the end of the page" (the content is longer than the window)
  const rs = [...slots.map((el) => el.getBoundingClientRect()), ...drawn.map((d) => ({ left: d.left, top: d.top, right: d.right, bottom: d.bottom >= vh - 2 ? Math.max(d.bottom, pageBottom) : d.bottom }))];
  const sr = { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  sr.width = sr.right - sr.left; sr.height = sr.bottom - sr.top;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const KEEP = ["color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration-line", "white-space",
    "background-color", "background-image", "background-size", "background-position", "background-repeat", "opacity", "border-radius", "box-shadow", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "display", "align-items", "justify-content"];
  const SIDES = ["top", "right", "bottom", "left"];
  const out = [], rasters = [], bgRefs = []; let n = 0, visited = 0;
  // a background picture (also a blob: one, which only this page can read) is fetched here and saved with the frame; the style names a file instead
  const bgOf = (value, k0) => value.replace(/url\\((["']?)(.*?)\\1\\)/g, (m, q, u) => { bgRefs.push({ k: bgRefs.length, url: u }); return "url(frame-img/bg" + (bgRefs.length - 1) + ".IMG)"; });
  const skip = (el) => ["SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "TEMPLATE"].includes(el.tagName) || el.id === "__uu5mock_hl" || el.id === "__uu5mock_bar" || el.classList?.contains("__uu5mock_mark");
  // how much of the element lies in the area (el), and how much of the area the element covers (slot); a sidebar that only touches the area by its padding or border has little of both
  const overlap = (r) => { const w = Math.min(r.right, sr.right) - Math.max(r.left, sr.left), h = Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top); if (w <= 0 || h <= 0) return { el: 0, slot: 0 }; const x = w * h; return { el: x / (r.width * r.height), slot: x / Math.max(1, (sr.right - sr.left) * (sr.bottom - sr.top)) }; };
  const walk = (el, clip, posClip) => {
    if (n > 1500 || visited++ > 20000 || skip(el) || slots.includes(el)) return;
    if (slots.some((x) => el.contains(x))) { for (const c of el.children) walk(c, clip, posClip); return; }
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    // overflow cuts only what it contains: a fixed box is cut by no parent, an absolute one by the clip of its nearest positioned parent
    if (cs.position === "fixed") clip = null; else if (cs.position === "absolute") clip = posClip;
    const positioned = cs.position !== "static" || cs.transform !== "none";
    if (cs.display === "none") return;
    if (cs.display === "contents") { for (const c of el.children) walk(c, clip, posClip); return; }
    if (el.checkVisibility && !el.checkVisibility()) return; // inside something hidden (display:none above it, content-visibility)
    if (cs.opacity === "0") return; // transparent: invisible with all it holds
    if (r.width > 0 && r.height > 0 && (r.top >= vh || r.bottom <= 0 || r.left >= vw || r.right <= 0)) return; // outside the window: not seen in the frame (and for the content below the fold the area covers it anyway)
    if ((r.width < 1 && cs.overflowX !== "visible") || (r.height < 1 && cs.overflowY !== "visible")) return; // a box without size that cuts its content off (a collapsed drawer)
    if (cs.visibility === "hidden" || r.width < 1 || r.height < 1) { for (const c of el.children) walk(c, clip, posClip); return; } // 0-height boxes hold visible children
    const ov = overlap(r);
    if (ov.slot > 0.5) { for (const c of el.children) walk(c, clip, posClip); return; } // a container that covers the area (a page body, a scroll box): only what it holds beside the area is the frame
    if (ov.el > 0.98) return; // lies wholly inside the area: it is the content (what only reaches into it is looked into below)
    // what the parents with overflow hidden/auto cut off is not seen: nothing of it is part of the frame (a collapsed drawer menu, a carousel's other slides)
    const vis = clip ? { l: Math.max(r.left, clip.l), t: Math.max(r.top, clip.t), r: Math.min(r.right, clip.r), b: Math.min(r.bottom, clip.b) } : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    if (vis.r <= vis.l || vis.b <= vis.t) return; // fully cut off
    const frac = ((vis.r - vis.l) * (vis.b - vis.t)) / (r.width * r.height);
    const own0 = cs.overflowX !== "visible" || cs.overflowY !== "visible";
    const kidClip = own0 ? { l: cs.overflowX !== "visible" ? vis.l : (clip?.l ?? -1e9), t: cs.overflowY !== "visible" ? vis.t : (clip?.t ?? -1e9), r: cs.overflowX !== "visible" ? vis.r : (clip?.r ?? 1e9), b: cs.overflowY !== "visible" ? vis.b : (clip?.b ?? 1e9) } : clip;
    if (ov.el > 0.15) { for (const c of el.children) walk(c, kidClip, positioned ? kidClip : posClip); return; } // reaches into the content area (a page background, a wrapper): not a box of the frame, but what it holds outside the area is
    let own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.replace(/\\s+/g, " ").trim()).filter(Boolean).join(" ");
    // a sentence with a link or bold words in it stays one block: the words keep their place in the line (as pieces they would be laid out apart)
    let inlineHtml = null;
    if (own && el.children.length && [...el.children].every((c) => getComputedStyle(c).display === "inline" && !c.querySelector("img,svg,canvas") && c.tagName !== "IMG" && c.tagName !== "svg")) {
      const span = (c) => { const k = getComputedStyle(c); return '<span style="' + attr(["color", "font-weight", "font-style", "font-family", "font-size", "text-decoration-line", "text-transform", "letter-spacing"].map((p) => p + ":" + k.getPropertyValue(p)).join(";")) + '">' + [...c.childNodes].map(part).join("") + "</span>"; };
      const part = (c) => (c.nodeType === 3 ? esc(c.textContent.replace(/\\s+/g, " ")) : c.nodeType === 1 ? span(c) : "");
      inlineHtml = [...el.childNodes].map(part).join("").trim();
    }
    const borders = SIDES.map((s) => ({ s, w: parseFloat(cs["border-" + s + "-width"]) || 0, c: cs["border-" + s + "-color"], st: cs["border-" + s + "-style"] })).filter((b) => b.w && b.st !== "none");
    const bg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
    const pseudo = (w) => { const c = getComputedStyle(el, w).content; return c && c !== "none" && c !== "normal" && c !== '""' && c !== "''" ? c : null; };
    const mask = (cs.webkitMaskImage || cs.maskImage || "none") !== "none";
    // what cannot be rebuilt from styles (icon fonts, photos, masks, canvas) is taken as a small picture of the real page
    if (frac >= 0.5 && rasters.length < 150 && (el.tagName === "IMG" || el.tagName === "CANVAS" || el.tagName === "IFRAME" || el.tagName === "VIDEO" || mask || (!own && r.width <= 160 && r.height <= 160 && (pseudo("::before") || pseudo("::after"))))) {
      const k = rasters.length; rasters.push({ left: r.left, top: r.top, width: r.width, height: r.height });
      const wide = r.width >= vw - 2, right = r.left > vw / 2 && !wide;
      const st = ["position:fixed", right ? "right:" + Math.round(vw - r.right) + "px" : "left:" + Math.round(r.left) + "px", "top:" + Math.round(r.top) + "px", "width:" + Math.round(r.width) + "px", "height:" + Math.round(r.height) + "px", "overflow:hidden", "border-radius:" + cs.borderRadius];
      out.push('<div style="' + attr(st.join(";")) + '"><img src="frame-img/r' + k + '.png" alt="" style="display:block;width:100%;height:100%"></div>'); n++;
      return;
    }
    const media = el.tagName === "IMG" || el.tagName === "svg" || el instanceof SVGElement && el.tagName.toLowerCase() === "svg";
    for (const w of ["::before", "::after"]) { // a picture on a pseudo-element (the photo of a page header is often there): a box of its own under the content of the element
      const pc = getComputedStyle(el, w);
      if (frac >= 0.5 && pc.content !== "none" && /url\\(/.test(pc.backgroundImage)) {
        n++;
        out.push('<div style="' + attr(["position:fixed", "left:" + Math.round(r.left) + "px", "top:" + Math.round(r.top) + "px", "width:" + Math.round(r.width) + "px", "height:" + Math.round(r.height) + "px", "background-image:" + bgOf(pc.backgroundImage), "background-size:" + pc.backgroundSize, "background-position:" + pc.backgroundPosition, "background-repeat:" + pc.backgroundRepeat, "opacity:" + pc.opacity].join(";")) + '"></div>');
      }
    }
    if (frac >= 0.5 && (own || bg || borders.length || media)) {
      n++;
      const st = ["position:fixed"];
      const wide = r.width >= vw - 2, right = r.left > vw / 2 && !wide;
      st.push(right ? "right:" + Math.round(vw - r.right) + "px" : "left:" + Math.round(r.left) + "px");
      st.push("top:" + Math.round(r.top) + "px");
      if (wide) st.push("right:0", "left:0"); else st.push("width:" + Math.round(r.width) + "px");
      st.push("height:" + Math.round(r.height) + "px", "box-sizing:border-box", "overflow:hidden");
      if (frac < 0.999) st.push("clip-path:inset(" + [vis.t - r.top, r.right - vis.r, r.bottom - vis.b, vis.l - r.left].map((v) => Math.max(0, Math.round(v)) + "px").join(" ") + ")");
      for (const k of KEEP) { let v = cs.getPropertyValue(k); if (k === "background-image" && /url\\(/.test(v)) v = bgOf(v); if (v && !(k === "background-color" && v === "rgba(0, 0, 0, 0)") && !(k === "background-image" && v === "none") && !(k === "opacity" && v === "1")) st.push(k + ":" + v); }
      for (const b of borders) st.push("border-" + b.s + ":" + b.w + "px " + b.st + " " + b.c);
      let inner = inlineHtml ?? esc(own);
      if (el.tagName === "IMG") inner = '<img src="' + attr(el.currentSrc || el.src) + '" alt="" style="width:100%;height:100%;object-fit:' + cs.objectFit + '">';
      else if (media) inner = el.outerHTML.replace(/<svg/, '<svg style="width:100%;height:100%"');
      out.push('<div style="' + attr(st.join(";")) + '">' + inner + "</div>");
    }
    if (inlineHtml == null && el.tagName !== "svg" && !(el instanceof SVGElement)) { const pc = positioned ? kidClip : posClip; for (const c of el.children) walk(c, kidClip, pc); if (el.shadowRoot) for (const c of el.shadowRoot.children) walk(c, kidClip, pc); } // (the parts of a web component live in its shadow root)
  };
  walk(document.body, null, null);
  const offset = { top: Math.max(0, Math.round(sr.top)), left: Math.max(0, Math.round(sr.left)), right: Math.max(0, Math.round(vw - sr.right)), bottom: sr.bottom >= vh - 2 ? 0 : Math.max(0, Math.round(vh - sr.bottom)) };
  const images = [];
  let html = out.join("\\n");
  const MB = 6 * 1024 * 1024;
  await Promise.all(bgRefs.map(async ({ k, url }) => {
    let ref = "data:,"; // a picture that cannot be read stays out
    try {
      const blob = await (await fetch(url)).blob();
      if (blob.size && blob.size <= MB && /^image\\//.test(blob.type)) {
        const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif" })[blob.type] || "png";
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
        images.push({ name: "bg" + k + "." + ext, data }); ref = "frame-img/bg" + k + "." + ext;
      }
    } catch { /* cross-origin without CORS, expired */ }
    html = html.split("frame-img/bg" + k + ".IMG").join(ref);
  }));
  return { html, css: "", offset, width: vw, height: vh, boxes: n, rasters, images, title: document.title };
})()`;
