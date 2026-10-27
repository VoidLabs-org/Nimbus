import { storedChoice } from "./storedChoice";
import type { NimbusDesktop } from "./desktop";

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

/**
 * Whether a key press is the fold shortcut: ⌘ \ on macOS, Ctrl \ elsewhere, with no other modifier. Matched on the key
 * (`\`) or, for keyboards where that key types something else, on its position (Backslash).
 */
export function isFoldShortcut(
  event: {
    key: string;
    code: string;
    altKey: boolean;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
  },
  platform: NimbusDesktop["platform"],
): boolean {
  const mac = platform === "darwin";
  if (event.altKey || event.shiftKey) return false;
  if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return false;
  return event.key === "\\" || event.code === "Backslash";
}
