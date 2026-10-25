// Runs before the page, in the sandbox. It is CommonJS because a sandboxed preload can't load ES modules.
// The page only gets what is listed here (context isolation keeps the rest of Electron out of reach).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("nimbusDesktop", {
  /** "darwin" (macOS), "win32" or "linux". */
  platform: process.platform,
});
