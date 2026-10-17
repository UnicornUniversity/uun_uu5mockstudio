import { randomUUID } from "node:crypto";
import path from "node:path";

const MIME = { ".html": "text/html", ".zip": "application/zip", ".png": "image/png", ".jpg": "image/jpeg", ".pdf": "application/pdf" };

/** RFC 2047 encoded-word for non-ASCII header values. */
export const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

const asciiName = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
const wrap76 = (b64) => b64.match(/.{1,76}/g)?.join("\r\n") ?? "";

/**
 * Builds an unsent e-mail (.eml) with attachments. `X-Unsent: 1` makes Outlook and Thunderbird open it as an
 * editable draft in the compose window, so the user only has to pick the recipient.
 * `attachments`: [{ name, data: Buffer }]
 */
export function buildEml({ subject, body, attachments, to = "" }) {
  const boundary = `=_uu5studio_${randomUUID()}`;
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(body, "utf8").toString("base64")),
  ];
  for (const { name, data } of attachments) {
    const type = MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
    lines.push(
      `--${boundary}`,
      `Content-Type: ${type}; name="${asciiName(name)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "",
      wrap76(data.toString("base64")),
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

export const mailBody = (kind, name) => kind === "zip"
  ? `Hi,\n\nattached is the project “${name}” from uu5Mock Studio (ZIP).\nUnzip it, run "node serve.mjs" and open http://localhost:4321/ (you need Node.js and an internet connection for the uu5 libraries).\n`
  : `Hi,\n\nattached is the mockup “${name}” from uu5Mock Studio (HTML).\nOpen the file in a browser; it needs an internet connection for the uu5 libraries.\n`;
