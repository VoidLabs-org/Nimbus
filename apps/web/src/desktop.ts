/**
 * What the Desktop app's preload script (`apps/desktop/src/preload.cjs`) tells the page. Absent in a browser, so
 * everything here is optional.
 */
declare global {
  interface Window {
    nimbusDesktop?: {
      /** True in the built app on app://nimbus, as opposed to `pnpm dev:desktop`, which loads the dev server. */
      packaged: boolean;
    };
  }
}

/**
 * Whether Google and GitHub sign-in can work here. The providers send the browser back to the server's PUBLIC_URL,
 * which in the packaged Desktop app is not the window (ADR 0007), so there the buttons are left out.
 */
export function canUseProviders(): boolean {
  // `window` is missing in tests that run without a DOM.
  return typeof window === "undefined" || window.nimbusDesktop?.packaged !== true;
}
