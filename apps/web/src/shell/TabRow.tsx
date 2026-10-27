import { Glyph } from "@repo/ui/glyph";
import { IconX } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import classes from "./TabRow.module.css";
import type { Tabs } from "./tabs";

/**
 * The Tab row, in the title bar (design 2a): one Tab per open page, the selected one in the page's colour, joined to
 * it. A Tab closes with its ✕ or a middle click. The row is only as wide as its Tabs, so the rest of the title row
 * stays the window's drag area; when they don't fit it scrolls sideways, keeping the selected Tab in view, and a long
 * name is cut short.
 */
export function TabRow({ tabs, onClose }: { tabs: Tabs; onClose: (path: string) => void }) {
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [tabs.selected, tabs.tabs.length]);

  return (
    <nav aria-label="Tabs" className={classes.row}>
      {tabs.tabs.map((tab) => {
        const selected = tab.path === tabs.selected;
        return (
          <div
            key={tab.path}
            ref={selected ? selectedRef : undefined}
            className={classes.tab}
            data-selected={selected || undefined}
            // The middle button closes, as in browsers; it never opens the link elsewhere or starts autoscroll.
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              onClose(tab.path);
            }}
          >
            <Link
              to={tab.path}
              className={classes.link}
              title={tab.title}
              aria-current={selected ? "page" : undefined}
            >
              {tab.title}
            </Link>
            <button
              type="button"
              className={classes.close}
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.path)}
            >
              <Glyph icon={IconX} size={14} />
            </button>
          </div>
        );
      })}
    </nav>
  );
}
