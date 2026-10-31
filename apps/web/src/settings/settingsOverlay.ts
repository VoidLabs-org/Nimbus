import { createContext, use } from "react";

/**
 * Where a component is relative to the Desktop app's Settings overlay: "closed" when there is none (always in a
 * browser), "behind" for the page and shell under it, "inside" for the Settings page it shows.
 */
export type SettingsOverlayPlace = "closed" | "behind" | "inside";

export const SettingsOverlayContext = createContext<SettingsOverlayPlace>("closed");

export function useSettingsOverlay(): SettingsOverlayPlace {
  return use(SettingsOverlayContext);
}

/** Whether an address is Settings or one of its pages, which the Desktop app opens in the overlay. */
export function isSettingsPath(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

/** The Settings overlay's chunk: what App.tsx's `lazy` loads, and what the shell loads ahead of it. */
export const loadSettingsOverlay = () => import("../shell/SettingsOverlay");

/**
 * Starts loading the overlay's chunk before anyone opens Settings, so opening waits for nothing. A chunk that can't
 * load (a redeploy removed it) is not this call's to report: App.tsx's own load of it fails the same way and shows
 * Settings as pages.
 */
export function preloadSettingsOverlay(): void {
  loadSettingsOverlay().catch(() => {});
}
