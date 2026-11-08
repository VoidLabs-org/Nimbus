import { Menu } from "@mantine/core";
import { IconArrowBarToDown, IconArrowBarToUp } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { Issue } from "../api/client";
import { IssueMenuContext } from "./issueMenuContext";

export type MoveToEnd = (issue: Issue, to: "top" | "bottom") => void;

/** Whether the Issue is known to be first (`top`) or last (`bottom`) in its Status already, so that item does nothing. */
export type AtEnd = { top: boolean; bottom: boolean };

/** The Move items of an Issue's menu, here and on the Issue page; one it is already at is disabled. */
export function MoveToEndItems({
  issue,
  onMove,
  atEnd = { top: false, bottom: false },
}: {
  issue: Issue;
  onMove: MoveToEnd;
  atEnd?: AtEnd;
}) {
  return (
    <>
      <Menu.Item
        leftSection={<IconArrowBarToUp size={16} aria-hidden />}
        disabled={atEnd.top}
        onClick={() => onMove(issue, "top")}
      >
        Move to top
      </Menu.Item>
      <Menu.Item
        leftSection={<IconArrowBarToDown size={16} aria-hidden />}
        disabled={atEnd.bottom}
        onClick={() => onMove(issue, "bottom")}
      >
        Move to bottom
      </Menu.Item>
    </>
  );
}

/**
 * The Issue menu for a view's cards and rows (see useIssueMenu): one menu, opened where it was asked for, with Move
 * to top and Move to bottom of the Issue's Status. Only Issues the User may move (`has`) have it. Closing it gives
 * focus back to the card or row it was opened from.
 */
export function IssueMenuHost({
  has,
  onMove,
  atEnd,
  children,
}: {
  has: (issue: Issue) => boolean;
  onMove: MoveToEnd;
  /** What the view can tell about where the Issue is in its Status; an item it is already at is disabled. */
  atEnd?: (issue: Issue) => AtEnd;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState<{
    issue: Issue;
    x: number;
    y: number;
    from: HTMLElement;
  } | null>(null);
  const open = (issue: Issue, at: { x: number; y: number }, from: HTMLElement) =>
    setOpened({ issue, ...at, from });
  function close() {
    // The element it opened from, or, if a move re-drew it, the Issue's card or row now (its link, for a row).
    let from = opened?.from.isConnected ? opened.from : null;
    if (opened && !from) {
      const now = document.querySelector<HTMLElement>(
        `[data-issue="${CSS.escape(opened.issue.key)}"]`,
      );
      from = now?.tagName === "TR" ? now.querySelector<HTMLElement>("a") : now;
    }
    from?.focus({ preventScroll: true });
    setOpened(null);
  }
  return (
    <IssueMenuContext value={{ has, open }}>
      {children}
      <Menu
        opened={opened !== null}
        onClose={close}
        position="bottom-start"
        shadow="md"
        radius="lg"
        withinPortal
        // The anchor is a point, not an element on screen: never take it for one scrolled out of view.
        hideDetached={false}
      >
        <Menu.Target>
          {/* Where the menu opens: the pointer, or under the card or row. */}
          <span
            aria-hidden
            style={{
              position: "fixed",
              left: opened?.x ?? 0,
              top: opened?.y ?? 0,
              width: 0,
              height: 0,
            }}
          />
        </Menu.Target>
        <Menu.Dropdown aria-label={opened ? `Actions for ${opened.issue.key}` : undefined}>
          {opened && (
            <MoveToEndItems issue={opened.issue} onMove={onMove} atEnd={atEnd?.(opened.issue)} />
          )}
        </Menu.Dropdown>
      </Menu>
    </IssueMenuContext>
  );
}
