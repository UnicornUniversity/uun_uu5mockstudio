/**
 * Links the app can read as input (shared by the renderer and the main process, no dependencies): a page of a uuBookKit book,
 * an ECC document of uuManagementKit (read through MCP) and any other web page (http/https: the app opens it and takes a picture and the text).
 */

const AWID = /^(?:\d{1,12}-)?([0-9a-f]{32})$/i; // the address may name the tenant too: <tid>-<awid>; the tools take the awid alone
const OID = /^[0-9a-f]{24}$/i;

/**
 * A link to a document of Plus4U, or null: `https://uuapp.plus4u.net/uu-bookkit-maing01/<awid>/book/page?code=<code>` (also `/book` = the
 * home page, as is the address of the book itself without `/book`; the awid may come as `<tid>-<awid>`) and `https://uuapp.plus4u.net/uu-managementkit-maing02/<awid>/…?oid=<oid>` (`pageOid` when present). Only https on *.plus4u.net.
 */
export function parseDocUrl(text) {
  let u;
  try { u = new URL(String(text ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:" || !/(^|\.)plus4u\.net$/i.test(u.hostname)) return null;
  const [app, id, ...rest] = u.pathname.split("/").filter(Boolean);
  const awid = AWID.exec(id ?? "")?.[1];
  if (!awid) return null;
  const url = u.toString();
  if (app === "uu-bookkit-maing01") {
    if (rest.length && rest[0] !== "book") return null;
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

/** Any other web page: `{ kind: "web", url, host }` for an http(s) link without a password in it, else null. */
export function parseWebUrl(text) {
  let u;
  try { u = new URL(String(text ?? "").trim()); } catch { return null; }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname || u.username || u.password) return null;
  u.hash = ""; // the fragment only scrolls: one page, one card
  return { kind: "web", url: u.toString(), host: u.hostname.replace(/^www\./i, "") };
}

/** A document of Plus4U when the link is one, else any web page, else null. */
export const parseLink = (text) => parseDocUrl(text) ?? parseWebUrl(text);

/** All links in a text that can be read (each once, in the order they appear). */
export function findDocUrls(text) {
  const seen = new Set(), out = [];
  for (const m of String(text ?? "").matchAll(/https?:\/\/[^\s<>"'`)\]]+/g)) {
    const d = parseLink(m[0].replace(/[.,;:!?]+$/, ""));
    if (d && !seen.has(d.url)) { seen.add(d.url); out.push(d); }
  }
  return out;
}

/** The name of the kind of a parsed link, for the UI. */
export const kindLabel = (kind) => (kind === "bookkit" ? "uuBookKit" : kind === "mkEcc" ? "uuManagementKit" : kind === "web" ? "Web page" : kind);
