/**
 * The user guide in the search field of the macOS Help menu: the native handler (native/helpsearch, built by
 * scripts/build-native.mjs) lists the sections of the guide as Help Topics; picking one sends "help:open:<file>#<id>" (or, for
 * "Show All Help Topics", "help:search:<words>") to `onAction`, which opens the app's own User Guide window there.
 * Without the module (not built, another platform) nothing happens: the Help menu then searches only its menu items.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parseChapters, helpSearchEntries, STOP } from "../renderer/helpDocs.js";

const require = createRequire(import.meta.url);

/** `appPath` = app.getAppPath(). → true when the handler is registered, else the reason it is not. */
export function installHelpSearch({ appPath, onAction }) {
  if (process.platform !== "darwin") return "not macOS";
  let native;
  try { native = require(path.join(appPath, "native", "helpsearch", "build", "helpsearch.node")); } catch (e) { return `the native module is not built (npm run build:native): ${e.message}`; }
  const dir = path.join(appPath, "docs", "user");
  const files = fs.readdirSync(dir).filter((n) => /^[\w.-]+\.md$/.test(n)).map((file) => ({ file, text: fs.readFileSync(path.join(dir, file), "utf8") }));
  return native.install(helpSearchEntries(parseChapters(files)), [...STOP], (action) => { if (/^help:(open|search):/.test(String(action))) onAction(String(action)); });
}
