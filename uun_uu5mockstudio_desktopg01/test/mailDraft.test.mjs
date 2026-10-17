import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEml, encodeHeader, mailBody } from "../src/main/mailDraft.mjs";
import { formatFromPath } from "../src/main/capture.mjs";

const parts = (eml) => {
  const boundary = eml.match(/boundary="([^"]+)"/)[1];
  return eml.split(`--${boundary}`).slice(1, -1).map((p) => p.replace(/^\r\n/, ""));
};
const b64body = (part) => Buffer.from(part.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64");

test("eml is an unsent multipart message with CRLF line endings", () => {
  const eml = buildEml({ subject: "Test", body: "Ahoj", attachments: [{ name: "a.html", data: Buffer.from("<p>x</p>") }] });
  assert.match(eml, /^To: \r\nSubject: Test\r\nX-Unsent: 1\r\nMIME-Version: 1\.0\r\nContent-Type: multipart\/mixed; boundary=/);
  assert.ok(!/[^\r]\n/.test(eml), "no bare LF");
  assert.ok(eml.trimEnd().endsWith("--"), "closing boundary");
});

test("body and attachment survive a base64 round trip, byte for byte", () => {
  const data = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256));
  const eml = buildEml({ subject: "S", body: "Příloha: žluťoučký kůň", attachments: [{ name: "x.zip", data }] });
  const [text, att] = parts(eml);
  assert.equal(b64body(text).toString("utf8"), "Příloha: žluťoučký kůň");
  assert.ok(b64body(att).equals(data));
  assert.match(att, /Content-Type: application\/zip; name="x\.zip"/);
  assert.ok(att.split("\r\n").every((l) => l.length <= 998), "RFC 5322 line length");
});

test("non-ASCII subject is RFC 2047 encoded", () => {
  assert.equal(encodeHeader("plain"), "plain");
  const enc = encodeHeader("uu5 mockup: Výchozí");
  assert.match(enc, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  assert.equal(Buffer.from(enc.slice(10, -2), "base64").toString("utf8"), "uu5 mockup: Výchozí");
});

test("non-ASCII attachment names get an ASCII fallback plus filename*", () => {
  const eml = buildEml({ subject: "S", body: "b", attachments: [{ name: "Výchozí projekt.zip", data: Buffer.from("z") }] });
  assert.match(eml, /filename="Vychozi projekt\.zip"; filename\*=UTF-8''V%C3%BDchoz%C3%AD%20projekt\.zip/);
});

test("mail body mentions how to open the attachment", () => {
  assert.match(mailBody("zip", "P"), /node serve\.mjs/);
  assert.match(mailBody("html", "S"), /in a browser/);
});

test("image format follows the chosen file extension", () => {
  assert.equal(formatFromPath("/a/b.png"), "png");
  assert.equal(formatFromPath("/a/b.JPG"), "jpg");
  assert.equal(formatFromPath("/a/b.jpeg"), "jpg");
  assert.equal(formatFromPath("/a/b.pdf"), "pdf");
  assert.equal(formatFromPath("/a/b"), "png", "unknown or missing extension falls back to png");
  assert.equal(formatFromPath("/a/b.exe"), "png");
});
