const timed = (p, ms) => new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });

/**
 * Screenshot of a preview <webview>. `webContents.capturePage()` never settles when the page is not being painted, which left the
 * agent waiting for minutes; so it gets a time limit, then the DevTools screenshot is tried, and finally `null` is returned
 * (the caller tells the agent to use the text snapshot and the console instead).
 */
export async function captureWithFallback(wc, { nativeImage, timeout = 12000 } = {}) {
  try {
    const img = await timed(wc.capturePage(), timeout);
    if (img && !img.isEmpty()) return img;
  } catch { /* not painting: try the DevTools route */ }
  const attach = !wc.debugger.isAttached();
  try {
    if (attach) wc.debugger.attach("1.3");
    const r = await timed(wc.debugger.sendCommand("Page.captureScreenshot", { format: "png" }), timeout);
    const img = nativeImage.createFromBuffer(Buffer.from(r.data, "base64"));
    if (!img.isEmpty()) return img;
  } catch { /* no screenshot available */ } finally {
    if (attach) { try { wc.debugger.detach(); } catch { /* already detached */ } }
  }
  return null;
}
