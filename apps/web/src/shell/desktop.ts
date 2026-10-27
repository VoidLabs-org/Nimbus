/** What the Desktop app's preload script (apps/desktop/src/preload.cjs) gives the page. */
export type NimbusDesktop = {
  platform: "darwin" | "win32" | "linux";
  /** Tells the window whether the page shows a light or a dark theme, so its own buttons match. */
  setTheme: (mode: "light" | "dark") => void;
};

declare global {
  interface Window {
    /** Present only in the Desktop app. */
    nimbusDesktop?: NimbusDesktop;
  }
}

/** The Desktop app's bridge, or null in a browser. */
export function nimbusDesktop(): NimbusDesktop | null {
  return typeof window === "undefined" ? null : (window.nimbusDesktop ?? null);
}

/** Whether Nimbus runs in the Desktop app rather than a browser. */
export function isDesktop(): boolean {
  return nimbusDesktop() !== null;
}

/** The fold shortcut's modifier as this computer names it: ⌘ on macOS, Ctrl elsewhere. */
export function modifierLabel(platform: NimbusDesktop["platform"]): string {
  return platform === "darwin" ? "⌘" : "Ctrl";
}
