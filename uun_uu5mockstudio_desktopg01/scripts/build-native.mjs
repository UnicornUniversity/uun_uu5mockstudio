/**
 * Builds the native module of the app (macOS only): native/helpsearch → native/helpsearch/build/helpsearch.node, the user guide in the
 * search field of the Help menu. One universal binary (arm64 + x86_64) built with clang against the Node-API headers, which are
 * ABI-stable, so the same file loads in every Electron. Needs the Xcode command-line tools. Without them (or on another platform)
 * it only says so: the app works without the module, the Help menu then searches only its menu items.
 *
 * Runs after `npm install` and before packaging (package.json). `--strict` makes a failure an error (packaging a release).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const strict = process.argv.includes("--strict");
const src = path.join(root, "native", "helpsearch", "helpsearch.mm");
const out = path.join(root, "native", "helpsearch", "build", "helpsearch.node");
const fail = (msg) => { console[strict ? "error" : "warn"](`build-native: ${msg}`); process.exit(strict ? 1 : 0); };

if (process.platform !== "darwin") fail("skipped (macOS only).");

/** The folder with node_api.h: next to this Node, else the headers node-gyp downloaded. */
function headers() {
  const near = path.join(path.dirname(process.execPath), "..", "include", "node");
  if (fs.existsSync(path.join(near, "node_api.h"))) return near;
  const cache = path.join(os.homedir(), "Library", "Caches", "node-gyp");
  for (const v of fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse() : []) {
    const d = path.join(cache, v, "include", "node");
    if (fs.existsSync(path.join(d, "node_api.h"))) return d;
  }
  return null;
}

const inc = headers();
if (!inc) fail("the Node-API headers (node_api.h) were not found; install Node with its headers or run `npx node-gyp install`.");
fs.mkdirSync(path.dirname(out), { recursive: true });
try {
  execFileSync("xcrun", [
    "clang++", "-std=c++17", "-ObjC++", "-fobjc-arc", "-O2", "-Wall",
    "-arch", "arm64", "-arch", "x86_64", "-mmacosx-version-min=11.0",
    "-bundle", "-undefined", "dynamic_lookup", "-framework", "Cocoa",
    "-I", inc, src, "-o", out,
  ], { stdio: "inherit" });
} catch (e) {
  fail(`clang failed (${e.message}). Are the Xcode command-line tools installed (xcode-select --install)?`);
}
console.log(`build-native: ${path.relative(root, out)}`);
