/**
 * Without a Developer ID certificate electron-builder leaves the app with only the linker signature of the Electron binary,
 * which does not seal Info.plist and the resources: macOS then calls the downloaded app "damaged". An ad-hoc signature over the
 * whole bundle makes it a valid (still unidentified) app, which opens through System Settings > Privacy & Security > Open Anyway.
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin" || process.env.CSC_LINK || process.env.APPLE_TEAM_ID) return; // a real certificate signs it
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
