/** What the Desktop app's preload script (apps/desktop/src/preload.cjs) gives the page. */
export type NimbusDesktop = {
  platform: "darwin" | "win32" | "linux";
  /** Tells the window whether the page shows a light or a dark theme, so its own buttons match. */
  setTheme: (mode: "light" | "dark") => void;
  /** Pops the app menu (Edit, View, Window) up at a point in the window; Windows and Linux show no menu bar. */
  showAppMenu: (x: number, y: number) => void;
  /**
   * Opens Google's or GitHub's sign-in in the system browser (with `linkTicket`, a connect from Security) and resolves
   * with what the browser handed back (ADR 0008). Missing in Desktop apps from before it, which sign in in the window.
   */
  signInWithProvider?: (request: {
    provider: string;
    linkTicket?: string | null;
  }) => Promise<BrowserSignInResult>;
  /** Opens the sign-in under way in the browser again. */
  reopenProviderSignIn?: () => void;
  /** Gives up the sign-in under way; `signInWithProvider` then resolves as cancelled. */
  cancelProviderSignIn?: () => void;
};

/**
 * What a sign-in in the system browser came back with: a one-time code and the verifier to trade it in with, the short
 * error the sign-in page shows (`cancelled`, `failed`), or nothing because the User cancelled or started again.
 */
export type BrowserSignInResult =
  | { outcome: "code"; code: string; verifier: string }
  | { outcome: "error"; error: string; provider: string | null }
  | { outcome: "cancelled" };

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

/**
 * The Desktop app's operating system. Only asked inside the Desktop app; "linux" (Ctrl shortcuts, the native frame)
 * if the bridge is somehow missing.
 */
export function desktopPlatform(): NimbusDesktop["platform"] {
  return nimbusDesktop()?.platform ?? "linux";
}

/** What a shortcut check needs from a key press. */
export type ShortcutKey = {
  key: string;
  code: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

/**
 * Whether a key press is ⌘ + `key` on macOS, Ctrl + `key` elsewhere, with Shift only when `shift` says so and no other
 * modifier. Matched on the key or, for keyboards where that key types something else, on its position (`code`).
 */
export function isModifierShortcut(
  event: ShortcutKey,
  platform: NimbusDesktop["platform"],
  key: string,
  code: string,
  { shift = false }: { shift?: boolean } = {},
): boolean {
  const mac = platform === "darwin";
  if (event.altKey || event.shiftKey !== shift) return false;
  if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return false;
  return event.key === key || event.code === code;
}

/** ⌘ , on macOS, Ctrl , elsewhere: opens Settings, as in most desktop apps. */
export function isSettingsShortcut(
  event: ShortcutKey,
  platform: NimbusDesktop["platform"],
): boolean {
  return isModifierShortcut(event, platform, ",", "Comma");
}

/**
 * A shortcut as this computer names it, for labels and badges: ⌘ (and ⇧) on macOS, Ctrl (and Shift) elsewhere, a
 * space between, as in "Ctrl K" or "⌘ ⇧ T". The one place that spells shortcuts out.
 */
export function shortcutLabel(
  platform: NimbusDesktop["platform"],
  key: string,
  { shift = false }: { shift?: boolean } = {},
): string {
  const mac = platform === "darwin";
  return [mac ? "⌘" : "Ctrl", ...(shift ? [mac ? "⇧" : "Shift"] : []), key].join(" ");
}

/** The same shortcut for screen readers (aria-keyshortcuts): "Control+K", or "Meta+Comma" on macOS. */
export function ariaShortcut(platform: NimbusDesktop["platform"], key: string): string {
  return `${platform === "darwin" ? "Meta" : "Control"}+${key}`;
}
