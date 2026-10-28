import { Menu } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import type { Icon } from "@tabler/icons-react";
import classes from "./ContextMenu.module.css";

/** One row of a context menu, or a line between groups of rows. */
export type ContextMenuItem =
  | {
      icon: Icon;
      label: string;
      /** The shortcut that does the same, as this computer names it (shown, not bound here). */
      shortcut?: string;
      disabled?: boolean;
      onClick: () => void;
    }
  | "divider";

/** A context menu: where it opens (the pointer, in the window) and what it lists. */
export type ContextMenuState = { x: number; y: number; label: string; items: ContextMenuItem[] };

/**
 * A right-click menu in the Desktop app (design "Nimbus Desktop v2", the context menu): rows with an icon, a name and
 * the shortcut that does the same, opening at the pointer. Mantine's Menu gives it the keyboard (arrows, Enter, Esc)
 * and closes it on a click outside; its target is an empty point where the pointer was.
 */
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState | null;
  onClose: () => void;
}) {
  if (!menu) return null;
  return (
    <Menu
      opened
      onChange={(opened) => {
        if (!opened) onClose();
      }}
      position="bottom-start"
      offset={2}
      withinPortal
      trapFocus
      classNames={{ dropdown: classes.dropdown, item: classes.item, divider: classes.divider }}
    >
      <Menu.Target>
        <div className={classes.point} style={{ left: menu.x, top: menu.y }} />
      </Menu.Target>
      <Menu.Dropdown aria-label={menu.label}>
        {menu.items.map((item, index) =>
          item === "divider" ? (
            <Menu.Divider key={`divider-${index}`} />
          ) : (
            <Menu.Item
              key={item.label}
              leftSection={<Glyph icon={item.icon} size={16} />}
              rightSection={
                item.shortcut ? <span className={classes.shortcut}>{item.shortcut}</span> : null
              }
              disabled={item.disabled}
              onClick={item.onClick}
            >
              {item.label}
            </Menu.Item>
          ),
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
