import { Menu } from "@mantine/core";
import { IconArrowBarToDown, IconArrowBarToUp } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { Issue } from "../api/client";
import { IssueMenuContext } from "./issueMenuContext";

export type MoveToEnd = (issue: Issue, to: "top" | "bottom") => void;

/** The Move items of an Issue's menu, here and on the Issue page. */
export function MoveToEndItems({ issue, onMove }: { issue: Issue; onMove: MoveToEnd }) {
  return (
    <>
      <Menu.Item
        leftSection={<IconArrowBarToUp size={16} aria-hidden />}
        onClick={() => onMove(issue, "top")}
      >
        Move to top
      </Menu.Item>
      <Menu.Item
        leftSection={<IconArrowBarToDown size={16} aria-hidden />}
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
  children,
}: {
  has: (issue: Issue) => boolean;
  onMove: MoveToEnd;
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
    opened?.from.focus({ preventScroll: true });
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
          {opened && <MoveToEndItems issue={opened.issue} onMove={onMove} />}
        </Menu.Dropdown>
      </Menu>
    </IssueMenuContext>
  );
}
