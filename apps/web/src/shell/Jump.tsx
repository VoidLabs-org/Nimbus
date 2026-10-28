import { Modal, UnstyledButton } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { shortcutLabel, type NimbusDesktop } from "./desktop";
import {
  jumpGroups,
  readSearch,
  splitMatch,
  type JumpAction,
  type JumpItem,
  type JumpPage,
} from "./jumpTargets";
import classes from "./Jump.module.css";

/** A name with the part that matched the search marked. */
function Name({ label, term }: { label: string; term: string }) {
  const { before, hit, after } = splitMatch(label, term);
  return (
    <span data-label className={classes.label}>
      {before}
      {hit && <mark className={classes.hit}>{hit}</mark>}
      {after}
    </span>
  );
}

/** A key as the design's small badge. */
function Keys({ children }: { children: string }) {
  return <span className={classes.keys}>{children}</span>;
}

/**
 * Jump, the Desktop app's "Search or jump to…" (Ctrl or ⌘ K), from the "Nimbus Desktop v2" design (Search): a panel
 * near the top of the window with a search field over pages and actions in groups (see jumpGroups), the typed part of
 * each name marked. Typing `>` keeps only the actions, and says so. The arrow keys move the highlight round the list
 * (the focus stays in the field, as a combobox's does); Enter or a click picks it (`onPick`), with Ctrl (⌘ on macOS) a
 * page in a new Tab; Esc, its Esc badge or a click outside close it (`onClose`), giving the focus back to where it
 * was. Each opening starts empty.
 */
export function Jump({
  opened,
  platform,
  pages,
  actions,
  onPick,
  onClose,
}: {
  opened: boolean;
  platform: NimbusDesktop["platform"];
  pages: JumpPage[];
  actions: JumpAction[];
  onPick: (item: JumpItem, inNewTab: boolean) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(0);
  // Each opening starts empty (state set while rendering, so the old search never shows).
  const [wasOpened, setWasOpened] = useState(opened);
  if (opened !== wasOpened) {
    setWasOpened(opened);
    if (opened) {
      setTyped("");
      setActive(0);
    }
  }
  const search = readSearch(typed);
  const groups = jumpGroups(search, pages, actions);
  const items = groups.flatMap((group) => group.items);
  const highlighted = Math.min(active, items.length - 1);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;
  const list = useRef<HTMLDivElement>(null);
  const mac = platform === "darwin";

  // Keeps the highlighted item in view as the arrow keys move past the list's edge.
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((highlighted + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      // Enter that confirms what an input method (IME) is composing is typing, not a pick.
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      const item = items[highlighted];
      if (item) onPick(item, mac ? event.metaKey : event.ctrlKey);
    }
  };

  let index = 0;
  return (
    <Modal.Root opened={opened} onClose={onClose} size={640} yOffset={84} returnFocus>
      <Modal.Overlay backgroundOpacity={0.45} blur={4} />
      <Modal.Content className={classes.panel}>
        <Modal.Title className={classes.hidden}>Jump</Modal.Title>
        <div className={classes.search}>
          <Glyph icon={IconSearch} size={19} />
          {search.commands && <span className={classes.scope}>Commands</span>}
          <input
            data-autofocus
            role="combobox"
            aria-label="Search or jump to…"
            aria-expanded={items.length > 0}
            aria-controls={`${id}-list`}
            aria-activedescendant={items.length > 0 ? optionId(highlighted) : undefined}
            aria-autocomplete="list"
            className={classes.field}
            placeholder={search.commands ? "Type a command…" : "Search or jump to…"}
            value={typed}
            onChange={(event) => {
              setTyped(event.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <UnstyledButton className={classes.esc} onClick={onClose} aria-label="Close Jump">
            Esc
          </UnstyledButton>
        </div>
        {items.length === 0 && (
          <div className={classes.empty} role="status">
            <span className={classes.emptyTitle}>
              {search.commands ? "No commands match" : "No results for"} “{search.term}”
            </span>
            {!search.commands && <span>Type &gt; for commands.</span>}
          </div>
        )}
        <div
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label="Jump to"
          className={classes.list}
        >
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div className={classes.heading} aria-hidden>
                {group.label}
              </div>
              {group.items.map((item) => {
                const at = index++;
                return (
                  <div
                    key={item.kind === "page" ? item.to : item.id}
                    id={optionId(at)}
                    data-index={at}
                    role="option"
                    aria-selected={at === highlighted}
                    className={classes.option}
                    onMouseMove={() => setActive(at)}
                    onClick={(event) => onPick(item, mac ? event.metaKey : event.ctrlKey)}
                  >
                    <span className={classes.icon} aria-hidden>
                      <Glyph icon={item.icon} size={14} />
                    </span>
                    <Name label={item.label} term={search.term} />
                    {item.kind === "action" && item.shortcut && <Keys>{item.shortcut}</Keys>}
                    <span className={classes.enter} aria-hidden>
                      ↵
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className={classes.footer}>
          <span className={classes.hint}>
            <Keys>↑↓</Keys>Move
          </span>
          <span className={classes.hint}>
            <Keys>↵</Keys>Open
          </span>
          <span className={classes.hint}>
            <Keys>{shortcutLabel(platform, "↵")}</Keys>New tab
          </span>
          <span className={classes.spacer} />
          <span>
            <b className={classes.strong}>&gt;</b> commands
          </span>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
