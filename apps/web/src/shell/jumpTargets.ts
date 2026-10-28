import { IconSettings, type Icon } from "@tabler/icons-react";
import type { SettingsGroup } from "../settings/sections";
import { isModifierShortcut, type NimbusDesktop, type ShortcutKey } from "./desktop";
import { DESTINATIONS } from "./navigation";

/** A page Jump can open: one of the Sidebar's pages or a Settings page. */
export type JumpPage = {
  kind: "page";
  to: string;
  label: string;
  icon: Icon;
  group: "Pages" | "Settings";
};

/** Something Jump can do (a command): what it says, its icon, the shortcut that does the same, and doing it. */
export type JumpAction = {
  kind: "action";
  id: string;
  label: string;
  icon: Icon;
  shortcut?: string;
  run: () => void;
};

export type JumpItem = JumpPage | JumpAction;

/** A heading in Jump's list and the items under it. */
export type JumpGroup = { label: "Go to" | "Pages" | "Settings" | "Actions"; items: JumpItem[] };

/**
 * The pages Jump can open: the Sidebar's (Home, Projects), then the Settings pages the User may open, from the same
 * `settingsGroups` as the Settings overlay, so Roles & access and the Audit log appear only with their Permissions.
 * Pages only for now: projects and Issues come with their own tickets.
 */
export function jumpPages(settings: SettingsGroup[]): JumpPage[] {
  const pages: JumpPage[] = DESTINATIONS.filter((destination) => destination.id !== "settings").map(
    (destination) => ({
      kind: "page",
      to: destination.to,
      label: destination.label,
      icon: destination.icon,
      group: "Pages",
    }),
  );
  const settingsPages: JumpPage[] = settings.flatMap((group) =>
    group.items.map((item) => ({
      kind: "page" as const,
      to: item.to,
      label: item.label,
      icon: IconSettings,
      group: "Settings" as const,
    })),
  );
  return [...pages, ...settingsPages];
}

/** What a search means: `>` first asks for commands only, and the rest is what to look for. */
export type JumpSearch = { commands: boolean; term: string };

export function readSearch(typed: string): JumpSearch {
  return typed.startsWith(">")
    ? { commands: true, term: typed.slice(1).trim() }
    : { commands: false, term: typed.trim() };
}

/** The items whose name holds `term`, ignoring case: names starting with it first, each in list order. */
function matching<T extends JumpItem>(items: T[], term: string): T[] {
  const typed = term.toLowerCase();
  if (!typed) return items;
  const hits = items.filter((item) => item.label.toLowerCase().includes(typed));
  const starts = (item: T) => item.label.toLowerCase().startsWith(typed);
  return [...hits.filter(starts), ...hits.filter((item) => !starts(item))];
}

/** How many actions show before anything is typed (design "Nimbus Desktop v2", Search). */
const FIRST_ACTIONS = 4;

/**
 * Jump's list for a search, in groups (design "Nimbus Desktop v2", Search). Nothing typed: "Go to" (Home, Projects
 * and the first Settings page) and the first few actions. Typed: the matching pages, Settings pages and actions, each
 * under its heading. After `>`, only the actions. Empty groups are left out.
 */
export function jumpGroups(
  search: JumpSearch,
  pages: JumpPage[],
  actions: JumpAction[],
): JumpGroup[] {
  const groups: JumpGroup[] = [];
  if (search.commands) {
    groups.push({ label: "Actions", items: matching(actions, search.term) });
  } else if (!search.term) {
    const settings = pages.find((page) => page.group === "Settings");
    groups.push({
      label: "Go to",
      items: [...pages.filter((page) => page.group === "Pages"), ...(settings ? [settings] : [])],
    });
    groups.push({ label: "Actions", items: actions.slice(0, FIRST_ACTIONS) });
  } else {
    groups.push({
      label: "Pages",
      items: matching(
        pages.filter((page) => page.group === "Pages"),
        search.term,
      ),
    });
    groups.push({
      label: "Settings",
      items: matching(
        pages.filter((page) => page.group === "Settings"),
        search.term,
      ),
    });
    groups.push({ label: "Actions", items: matching(actions, search.term) });
  }
  return groups.filter((group) => group.items.length > 0);
}

/** A name split around the first place `term` appears in it, ignoring case, so that part can be marked. */
export function splitMatch(
  label: string,
  term: string,
): { before: string; hit: string; after: string } {
  const at = term ? label.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return { before: label, hit: "", after: "" };
  return {
    before: label.slice(0, at),
    hit: label.slice(at, at + term.length),
    after: label.slice(at + term.length),
  };
}

/** ⌘ K on macOS, Ctrl K elsewhere: opens Jump. */
export function isJumpShortcut(event: ShortcutKey, platform: NimbusDesktop["platform"]): boolean {
  return isModifierShortcut(event, platform, "k", "KeyK");
}
