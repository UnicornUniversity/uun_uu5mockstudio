import path from "node:path";

export const IMAGE_FORMATS = {
  png: { label: "PNG", ext: "png" },
  jpg: { label: "JPEG", ext: "jpg" },
  pdf: { label: "PDF", ext: "pdf" },
};
const MAX_SIDE = 16000; // Chromium refuses larger textures

/** Format is picked by the extension the user chose in the save dialog. */
export function formatFromPath(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (ext === "jpeg") return "jpg";
  return IMAGE_FORMATS[ext] ? ext : "png";
}

/** The strips of a page `full` css px tall, at most `step` tall: [{ y, height }]. */
export function slices(full, step) {
  const out = [], st = Math.max(1, Math.floor(step));
  for (let y = 0; y < full; y += st) out.push({ y, height: Math.min(st, full - y) });
  return out;
}

/**
 * Renders a mockup page (webContents of its <webview>) to PNG / JPEG / PDF.
 * Raster formats capture the whole scrollable page, not just the visible part, at `scale`x (2 = retina).
 * `nativeImage` (Electron's) joins the strips of a page taller than the frame.
 */
export async function captureScreen(wc, { format = "png", scale = 2, quality = 92, nativeImage } = {}) {
  // css size of the whole scrollable page and the display's pixel ratio (clip.scale is applied on top of it)
  const { width: w, height: h, dpr } = await wc.executeJavaScript(`({
    width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    dpr: window.devicePixelRatio || 1 })`);
  const width = Math.min(MAX_SIDE, Math.max(1, Math.ceil(w)));
  const height = Math.min(MAX_SIDE, Math.max(1, Math.ceil(h)));

  if (format === "pdf") {
    // one page exactly as large as the content (inches), no margins
    return wc.printToPDF({ printBackground: true, pageSize: { width: width / 96, height: height / 96 }, margins: { marginType: "none" } });
  }
  const dbg = wc.debugger;
  const attachedHere = !dbg.isAttached();
  if (attachedHere) dbg.attach("1.3");
  let emulated = false;
  try {
    // A <webview> paints only about two frames of height, whatever `captureBeyondViewport` says: the picture repeated the top of the
    // page all the way down. So the viewport is made as tall as the page (the frame keeps its width, no scroll bar, sticky and fixed
    // parts stay where they belong) and the page is taken in strips one frame tall, joined into one picture.
    const view = await wc.executeJavaScript(`({ width: window.innerWidth, height: window.innerHeight })`);
    let full = height;
    if (full > view.height) {
      let want = full;
      for (let pass = 0; pass < 2; pass++) { // a taller viewport may change the layout (100vh, lazy content): measured again once
        await dbg.sendCommand("Emulation.setDeviceMetricsOverride", { width: view.width, height: want, deviceScaleFactor: 0, mobile: false });
        emulated = true; full = want;
        const now = await wc.executeJavaScript(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() =>
          r(Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)), 150))))`);
        want = Math.min(MAX_SIDE, Math.max(1, Math.ceil(now)));
        if (want === full) break;
      }
    }
    const k = Math.min(scale, MAX_SIDE / Math.max(width, full)) / dpr;
    const shot = async (clip, fmt = "png") => Buffer.from((await dbg.sendCommand("Page.captureScreenshot", {
      format: fmt === "jpg" ? "jpeg" : "png", ...(fmt === "jpg" ? { quality } : {}), fromSurface: true, clip: { x: 0, ...clip, width, scale: k },
    })).data, "base64");
    const strips = slices(full, Math.max(200, view.height));
    if (strips.length === 1 || !nativeImage) return shot({ y: 0, height: full }, format);
    const parts = [];
    for (const s of strips) parts.push(nativeImage.createFromBuffer(await shot(s)));
    const pw = parts[0].getSize().width;
    const bitmaps = parts.map((img) => { const { width: iw, height: ih } = img.getSize(); return { bmp: img.toBitmap(), iw, ih }; });
    const rows = bitmaps.reduce((n, b) => n + b.ih, 0), out = Buffer.alloc(pw * rows * 4);
    let at = 0;
    for (const { bmp, iw, ih } of bitmaps) { // the strips have the same width; a pixel of rounding is cut or left transparent
      for (let row = 0; row < ih; row++) bmp.copy(out, (at + row) * pw * 4, row * iw * 4, row * iw * 4 + Math.min(iw, pw) * 4);
      at += ih;
    }
    const img = nativeImage.createFromBitmap(out, { width: pw, height: rows });
    return format === "jpg" ? img.toJPEG(quality) : img.toPNG();
  } finally {
    if (emulated && dbg.isAttached()) await dbg.sendCommand("Emulation.clearDeviceMetricsOverride").catch(() => {});
    if (attachedHere && dbg.isAttached()) dbg.detach();
  }
}
