import {
  IconArrowBarToRight,
  IconArrowBackUp,
  IconArrowUpRight,
  IconCircleX,
  IconCopy,
  IconLink,
  IconSquarePlus,
  IconX,
} from "@tabler/icons-react";
import { copy } from "../pages/copy";
import type { ContextMenuItem } from "./ContextMenu";
import { shortcutLabel, type NimbusDesktop } from "./desktop";
import type { Tab } from "./tabs";
import type { TabActions } from "./useTabs";

type Platform = NimbusDesktop["platform"];

/**
 * A Tab's right-click menu (design "Nimbus Desktop v2"): close it, the others or those to its right, duplicate it, or
 * reopen the last closed Tab. "Move to new window" waits for more than one app window.
 */
export function tabMenu(tab: Tab, actions: TabActions, platform: Platform): ContextMenuItem[] {
  const index = actions.tabs.tabs.findIndex((each) => each.id === tab.id);
  const alone = actions.tabs.tabs.length === 1;
  return [
    {
      icon: IconX,
      label: "Close tab",
      shortcut: shortcutLabel(platform, "W"),
      onClick: () => actions.close([tab.id]),
    },
    {
      icon: IconCircleX,
      label: "Close other tabs",
      disabled: alone,
      onClick: () => actions.closeOthers(tab.id),
    },
    {
      icon: IconArrowBarToRight,
      label: "Close tabs to the right",
      disabled: index === actions.tabs.tabs.length - 1,
      onClick: () => actions.closeToTheRight(tab.id),
    },
    "divider",
    { icon: IconCopy, label: "Duplicate tab", onClick: () => actions.duplicate(tab.id) },
    "divider",
    {
      icon: IconArrowBackUp,
      label: "Reopen closed tab",
      shortcut: shortcutLabel(platform, "T", { shift: true }),
      disabled: !actions.canReopen,
      onClick: actions.reopen,
    },
  ];
}

/**
 * A page link's right-click menu (the Sidebar's Home and Projects): open it here or in a new Tab, or copy its address.
 * Projects and Issues get their own menus with them.
 */
export function linkMenu(
  path: string,
  actions: TabActions,
  open: (path: string) => void,
  platform: Platform,
): ContextMenuItem[] {
  return [
    { icon: IconArrowUpRight, label: "Open", onClick: () => open(path) },
    {
      icon: IconSquarePlus,
      label: "Open in new tab",
      shortcut: shortcutLabel(platform, "Click"),
      onClick: () => actions.openNew(path),
    },
    "divider",
    {
      icon: IconLink,
      label: "Copy link",
      onClick: () => void copy(new URL(path, window.location.origin).href, "Link copied."),
    },
  ];
}
