import { Glyph } from "@repo/ui/glyph";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import classes from "./TabRow.module.css";
import type { Tab, Tabs } from "./tabs";

/**
 * The Tab row, in the title bar (design 2a): one Tab per open page, the selected one in the page's colour, joined to
 * it, and a + that opens a new Tab on Home. A Tab closes with its ✕ or a middle click; a right click opens its menu.
 * The row is only as wide as its Tabs, so the rest of the title row stays the window's drag area; when they don't fit
 * it scrolls sideways, keeping the selected Tab in view, and a long name is cut short.
 */
export function TabRow({
  tabs,
  onSelect,
  onClose,
  onNew,
  onMenu,
}: {
  tabs: Tabs;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onMenu: (tab: Tab, at: { x: number; y: number }) => void;
}) {
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tabs.selected, tabs.tabs.length]);

  return (
    <div className={classes.row}>
      <div role="tablist" aria-label="Tabs" className={classes.tabs}>
        {tabs.tabs.map((tab) => {
          const selected = tab.id === tabs.selected;
          return (
            <div
              key={tab.id}
              ref={selected ? selectedRef : undefined}
              className={classes.tab}
              data-selected={selected || undefined}
              // The middle button closes, as in browsers, and never starts autoscroll.
              onMouseDown={(event) => {
                if (event.button === 1) event.preventDefault();
              }}
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                onClose(tab.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                onMenu(tab, { x: event.clientX, y: event.clientY });
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className={classes.name}
                title={tab.title}
                onClick={() => onSelect(tab.id)}
              >
                {tab.title}
              </button>
              <button
                type="button"
                className={classes.close}
                aria-label={`Close ${tab.title}`}
                onClick={() => onClose(tab.id)}
              >
                <Glyph icon={IconX} size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className={classes.add} aria-label="New Tab" onClick={onNew}>
        <Glyph icon={IconPlus} size={16} />
      </button>
    </div>
  );
}
