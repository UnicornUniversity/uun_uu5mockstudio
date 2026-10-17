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

/**
 * Renders a mockup page (webContents of its <webview>) to PNG / JPEG / PDF.
 * Raster formats capture the whole scrollable page, not just the visible part, at `scale`x (2 = retina).
 */
export async function captureScreen(wc, { format = "png", scale = 2, quality = 92 } = {}) {
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
  try {
    const k = Math.min(scale, MAX_SIDE / Math.max(width, height)) / dpr;
    const r = await dbg.sendCommand("Page.captureScreenshot", {
      format: format === "jpg" ? "jpeg" : "png", ...(format === "jpg" ? { quality } : {}),
      captureBeyondViewport: true, fromSurface: true, clip: { x: 0, y: 0, width, height, scale: k },
    });
    return Buffer.from(r.data, "base64");
  } finally {
    if (attachedHere && dbg.isAttached()) dbg.detach();
  }
}
