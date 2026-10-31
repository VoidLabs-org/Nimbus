import { storedChoice } from "./storedChoice";
import { isModifierShortcut, type NimbusDesktop, type ShortcutKey } from "./desktop";

/** Whether the Desktop app's Sidebar shows names (open) or only a rail of icons (folded). */
export type SidebarState = "open" | "folded";

/** The storage key for the choice; the Desktop app keeps it on this computer. */
export const SIDEBAR_KEY = "nimbus-sidebar";

/** The media query below which the Sidebar folds itself, whatever was chosen: under 960px wide. */
export const AUTO_FOLD_QUERY = "(max-width: 959.98px)";

export function parseSidebarState(raw: string | null): SidebarState {
  return raw === "folded" ? "folded" : "open";
}

// Kept on this computer; a choice made on the Appearance page folds the Sidebar at once.
const sidebarState = storedChoice(SIDEBAR_KEY, parseSidebarState, "open");

/** Forgets the choice held in memory, so the next read comes from storage. For tests. */
export const resetSidebarState = sidebarState.reset;

/** The chosen Sidebar state and a way to change it; kept on this computer, and read on the first render. */
export function useSidebarState(): [SidebarState, (state: SidebarState) => void] {
  return sidebarState.useChoice();
}

/** ⌘ \ on macOS, Ctrl \ elsewhere: folds or opens the Sidebar. */
export function isFoldShortcut(event: ShortcutKey, platform: NimbusDesktop["platform"]): boolean {
  return isModifierShortcut(event, platform, "\\", "Backslash");
}
