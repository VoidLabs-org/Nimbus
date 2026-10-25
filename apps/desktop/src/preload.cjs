// Runs before the page, in the sandbox. It is CommonJS because a sandboxed preload can't load ES modules.
// The page only gets what is listed here (context isolation keeps the rest of Electron out of reach).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("nimbusDesktop", {
  // True when the page is the built app on app://nimbus, which has no way to finish a Google or GitHub sign-in:
  // the providers send the browser back to the PUBLIC_URL origin, not to this window (ADR 0007).
  packaged: process.argv.includes("--nimbus-packaged"),
});
