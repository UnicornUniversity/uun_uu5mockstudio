/** electron-builder configuration. Signing/notarization and the update feed are opt-in through environment variables. */
const env = process.env;

module.exports = {
  appId: "net.uu5mock.studio",
  productName: "uu5Mock Studio",
  copyright: "uu5Mock Studio",
  directories: { output: "dist", buildResources: "build" },
  asar: true,
  electronLanguages: ["en", "cs"],
  artifactName: "uu5Mock-Studio-${version}-${arch}.${ext}",
  // the license texts travel with every build (Contents/Resources on macOS)
  extraResources: [{ from: "../LICENSE", to: "LICENSE" }, { from: "../NOTICE", to: "NOTICE" }], // they sit in the repository root, next to this folder
  files: [
    "src/**/*",
    "package.json",
    // The Agent SDK ships a ~240 MB native `claude` per platform. This app drives the user's own Claude Code
    // (pathToClaudeCodeExecutable), so those binaries are never used.
    "!node_modules/@anthropic-ai/claude-agent-sdk-*/**",
    "!**/*.map",
  ],

  afterSign: "build/adhocSign.cjs",

  mac: {
    category: "public.app-category.developer-tools",
    // zip is required next to dmg: electron-updater updates macOS apps from the zip
    target: ["dmg", "zip"],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    // Needs APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (and a Developer ID certificate via CSC_LINK / keychain)
    notarize: Boolean(env.APPLE_TEAM_ID),
  },
  dmg: { title: "uu5Mock Studio ${version}", sign: false },

  win: { target: [{ target: "nsis", arch: ["x64"] }] },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false },

  linux: { target: [{ target: "AppImage", arch: ["x64"] }], category: "Development", synopsis: "AI prototyping of uu5 / uuGDS user interfaces" },

  // Generic provider: host the files from dist/ (latest*.yml + installers) at this URL.
  publish: env.UU5STUDIO_UPDATE_URL ? [{ provider: "generic", url: env.UU5STUDIO_UPDATE_URL }] : undefined,
};
