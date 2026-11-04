/**
 * Links to documents of Plus4U that the app can read as input (shared by the renderer and the main process, no dependencies):
 * a page of a uuBookKit book and an ECC document of uuManagementKit.
 */

const AWID = /^[0-9a-f]{32}$/i;
const OID = /^[0-9a-f]{24}$/i;

/**
 * A link to a document of Plus4U, or null: `https://uuapp.plus4u.net/uu-bookkit-maing01/<awid>/book/page?code=<code>` (also `/book` = the
 * home page) and `https://uuapp.plus4u.net/uu-managementkit-maing02/<awid>/…?oid=<oid>` (`pageOid` when present). Only https on *.plus4u.net.
 */
export function parseDocUrl(text) {
  let u;
  try { u = new URL(String(text ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || !/(^|\.)plus4u\.net$/i.test(u.hostname)) return null;
  const [app, awid, ...rest] = u.pathname.split("/").filter(Boolean);
  if (!awid || !AWID.test(awid)) return null;
  const url = u.toString();
  if (app === "uu-bookkit-maing01") {
    if (rest[0] !== "book") return null;
    const code = u.searchParams.get("code") || "home";
    if (!/^[\w.-]{1,120}$/.test(code)) return null;
    return { kind: "bookkit", url, awid: awid.toLowerCase(), code };
  }
  if (app === "uu-managementkit-maing02") {
    const oid = u.searchParams.get("oid");
    if (!oid || !OID.test(oid)) return null;
    const pageOid = u.searchParams.get("pageOid");
    return { kind: "mkEcc", url, awid: awid.toLowerCase(), oid: oid.toLowerCase(), ...(pageOid && OID.test(pageOid) ? { pageOid: pageOid.toLowerCase() } : {}) };
  }
  return null;
}

/** All document links in a text (each once, in the order they appear). */
export function findDocUrls(text) {
  const seen = new Set(), out = [];
  for (const m of String(text ?? "").matchAll(/https:\/\/[^\s<>"'`)\]]+/g)) {
    const d = parseDocUrl(m[0].replace(/[.,;:!?]+$/, ""));
    if (d && !seen.has(d.url)) { seen.add(d.url); out.push(d); }
  }
  return out;
}

/** The name of the kind of a parsed link, for the UI. */
export const kindLabel = (kind) => (kind === "bookkit" ? "uuBookKit" : kind === "mkEcc" ? "uuManagementKit" : kind);
