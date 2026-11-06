import { Drawer, Menu, Popover, TextInput, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { IssueCounts, IssueSearch, ProjectStatus } from "../api/client";
import {
  appliedFields,
  FIELD_ICONS,
  FIELD_LABELS,
  FILTER_FIELDS,
  issueCount,
  optionsFor,
  valueLabel,
  VIEWS,
  type FilterField,
  type FilterOption,
  type View,
} from "./issueFilters";
import classes from "./IssueToolbar.module.css";

type Props = {
  search: IssueSearch;
  statuses: ProjectStatus[];
  /** For the menu's counts and the toolbar's count; undefined while loading. */
  counts: IssueCounts | undefined;
  text: string;
  onText: (text: string) => void;
  view: View;
  onView: (view: View) => void;
  /** Sets one filter in the address (null removes it). */
  onFilter: (name: FilterField | "assignee", value: string | null) => void;
  /** Removes every Filter menu field (not search or the quick filters). */
  onClearMenu: () => void;
};

/**
 * The Issues toolbar (design "Issues toolbar", F2): search, the Filter button with its two-pane menu, the Mine and
 * Unassigned quick filters, the matching count and the view switcher on one row that never changes height, and a
 * row of tokens under it only while menu filters are applied. On a phone the search takes its own row, the views fold
 * into a menu and the Filter menu is a bottom sheet.
 */
export function IssueToolbar(props: Props) {
  const { search, counts, text, onText, view, onView, onFilter, onClearMenu } = props;
  const phone = useMediaQuery("(max-width: 48em)");
  const searchRef = useRef<HTMLInputElement>(null);
  const applied = appliedFields(search);

  // "/" focuses the search from anywhere but a field being typed in.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const quick = (who: "me" | "none", label: string) => (
    <button
      type="button"
      className={classes.control}
      data-on={search.assignee === who || undefined}
      aria-pressed={search.assignee === who}
      // Mine and Unassigned share the assignee filter, so picking one turns the other off.
      onClick={() => onFilter("assignee", search.assignee === who ? null : who)}
    >
      {label}
    </button>
  );
  const countLabel = counts ? (
    <span className={classes.count} aria-live="polite">
      {issueCount(counts.total)}
    </span>
  ) : (
    <span className={classes.countBone} aria-hidden />
  );

  return (
    <div className={classes.toolbar}>
      <div className={classes.row}>
        <TextInput
          ref={searchRef}
          aria-label="Search issues"
          placeholder="Search issues"
          className={classes.search}
          classNames={{ input: classes.searchInput }}
          leftSection={<IconSearch size={15} aria-hidden />}
          rightSection={
            text ? (
              <button
                type="button"
                className={classes.clearSearch}
                aria-label="Clear search text"
                onClick={() => {
                  onText("");
                  searchRef.current?.focus();
                }}
              >
                <IconX size={13} aria-hidden />
              </button>
            ) : (
              <kbd className={classes.kbd} aria-hidden>
                /
              </kbd>
            )
          }
          value={text}
          onChange={(event) => onText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && text) onText("");
          }}
        />
        <div className={classes.controls}>
          {phone ? <FilterSheet {...props} /> : <FilterMenu {...props} />}
          <span className={classes.divider} aria-hidden />
          {quick("me", "Mine")}
          {quick("none", "Unassigned")}
          {phone && <ViewMenu view={view} onView={onView} />}
        </div>
        {!phone && (
          <div className={classes.end}>
            {countLabel}
            <ViewSwitcher view={view} onView={onView} />
          </div>
        )}
      </div>
      {phone && <div className={classes.phoneCount}>{countLabel}</div>}
      {applied.length > 0 && (
        <div className={classes.tokens} role="group" aria-label="Applied filters">
          {applied.map((field) => {
            const value = search[field] as string;
            const option = optionsFor(field, props.statuses, undefined).find(
              (candidate) => candidate.value.toLowerCase() === value.toLowerCase(),
            );
            return (
              <span key={field} className={classes.token}>
                <span className={classes.tokenField}>{FIELD_LABELS[field]} is</span>
                {option?.mark}
                <span className={classes.tokenValue}>{valueLabel(field, value)}</span>
                <button
                  type="button"
                  className={classes.tokenClear}
                  aria-label={`Remove ${FIELD_LABELS[field]} filter`}
                  onClick={() => onFilter(field, null)}
                >
                  <IconX size={11} aria-hidden />
                </button>
              </span>
            );
          })}
          <button type="button" className={classes.clearAll} onClick={onClearMenu}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/** The Filter button's label, with the number of menu fields applied (not search or the quick filters). */
function FilterLabel({ applied }: { applied: number }) {
  return (
    <>
      <IconFilter size={15} aria-hidden />
      Filter
      {applied > 0 && (
        <span className={classes.badge} aria-label={`${applied} applied`}>
          {applied}
        </span>
      )}
    </>
  );
}

/**
 * The two-pane Filter menu: the fields on the left, the chosen field's values on the right, one value per field.
 * ↑ ↓ move within a pane, ← → switch panes, Enter picks (picking the chosen value again clears it), Esc closes and
 * gives focus back to Filter.
 */
function FilterMenu({ search, statuses, counts, onFilter }: Props) {
  const [opened, setOpened] = useState(false);
  const [field, setField] = useState<FilterField>("status");
  const panes = useRef<HTMLDivElement>(null);
  const applied = appliedFields(search);
  const options = optionsFor(field, statuses, counts);
  const chosen = search[field] as string | undefined;

  function focusIn(pane: "fields" | "values", index?: number) {
    const items = panes.current?.querySelectorAll<HTMLElement>(`[data-pane="${pane}"]`);
    if (!items || items.length === 0) return;
    const current = [...items].findIndex((item) => item.getAttribute("tabindex") === "0");
    items[index ?? Math.max(0, current)]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const pane = target.dataset.pane as "fields" | "values" | undefined;
    if (!pane) return;
    const items = [
      ...(panes.current?.querySelectorAll<HTMLElement>(`[data-pane="${pane}"]`) ?? []),
    ];
    const index = items.indexOf(target);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      next?.focus();
      if (pane === "fields" && next) setField(next.dataset.field as FilterField);
    } else if (event.key === "ArrowRight" && pane === "fields") {
      event.preventDefault();
      focusIn("values");
    } else if (event.key === "ArrowLeft" && pane === "values") {
      event.preventDefault();
      focusIn("fields");
    }
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      offset={8}
      trapFocus
      returnFocus
      shadow="md"
      classNames={{ dropdown: classes.menu }}
    >
      <Popover.Target>
        <button
          type="button"
          className={classes.control}
          data-open={opened || undefined}
          aria-haspopup="dialog"
          aria-expanded={opened}
          onClick={() => setOpened((open) => !open)}
        >
          <FilterLabel applied={applied.length} />
        </button>
      </Popover.Target>
      <Popover.Dropdown aria-label="Filter">
        <div className={classes.panes} ref={panes} onKeyDown={onKeyDown}>
          <div
            className={classes.fields}
            role="tablist"
            aria-orientation="vertical"
            aria-label="Fields"
          >
            {FILTER_FIELDS.map((each) => (
              <button
                key={each}
                type="button"
                role="tab"
                data-pane="fields"
                data-field={each}
                tabIndex={each === field ? 0 : -1}
                aria-selected={each === field}
                className={classes.field}
                onClick={() => setField(each)}
              >
                {FIELD_ICONS[each]}
                <span>{FIELD_LABELS[each]}</span>
                {search[each] !== undefined && <span className={classes.fieldCount}>1</span>}
              </button>
            ))}
          </div>
          <div className={classes.values}>
            <div className={classes.valuesHead}>{FIELD_LABELS[field]} · pick one</div>
            <Values
              field={field}
              options={options}
              chosen={chosen}
              onPick={(value) => onFilter(field, value)}
            />
            <button
              type="button"
              className={classes.clear}
              disabled={chosen === undefined}
              onClick={() => onFilter(field, null)}
            >
              Clear
            </button>
          </div>
        </div>
        <div className={classes.hints} aria-hidden>
          <kbd>↑</kbd>
          <kbd>↓</kbd> move <kbd>←</kbd>
          <kbd>→</kbd> switch pane <kbd>↵</kbd> pick <kbd>esc</kbd> close
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

/** A field's values as radio buttons; picking the chosen one again clears it. */
function Values({
  field,
  options,
  chosen,
  onPick,
  touch = false,
}: {
  field: FilterField;
  options: FilterOption[];
  chosen: string | undefined;
  onPick: (value: string | null) => void;
  touch?: boolean;
}) {
  const isChosen = (option: FilterOption) => chosen?.toLowerCase() === option.value.toLowerCase();
  const focusable = options.findIndex(isChosen);
  return (
    <div className={classes.options} role="radiogroup" aria-label={FIELD_LABELS[field]}>
      {options.length === 0 && <p className={classes.none}>No Statuses yet</p>}
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-pane="values"
          aria-checked={isChosen(option)}
          tabIndex={index === Math.max(0, focusable) ? 0 : -1}
          className={classes.option}
          data-touch={touch || undefined}
          onClick={() => onPick(isChosen(option) ? null : option.value)}
        >
          <span className={classes.radio} data-on={isChosen(option) || undefined} aria-hidden>
            {isChosen(option) && <IconCheck size={10} stroke={3} />}
          </span>
          {option.mark}
          <span className={classes.optionLabel}>{option.label}</span>
          <span className={classes.optionCount}>{option.count.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

/** On a phone: the Filter menu as a bottom sheet, the fields first, then a field's values. */
function FilterSheet({ search, statuses, counts, onFilter, onClearMenu }: Props) {
  const [opened, setOpened] = useState(false);
  const [field, setField] = useState<FilterField | null>(null);
  const applied = appliedFields(search);
  const close = () => {
    setOpened(false);
    setField(null);
  };
  const show = (
    <button type="button" className={classes.show} onClick={close}>
      Show {counts ? issueCount(counts.total) : "issues"}
    </button>
  );
  let body: ReactNode;
  if (field === null) {
    body = (
      <>
        <div className={classes.sheetHead}>
          <h2>Filter</h2>
          <button
            type="button"
            className={classes.sheetAction}
            disabled={applied.length === 0}
            onClick={onClearMenu}
          >
            Clear all
          </button>
        </div>
        {FILTER_FIELDS.map((each) => (
          <UnstyledButton key={each} className={classes.sheetField} onClick={() => setField(each)}>
            {FIELD_ICONS[each]}
            <span className={classes.optionLabel}>{FIELD_LABELS[each]}</span>
            {search[each] !== undefined && (
              <span className={classes.sheetValue}>{valueLabel(each, search[each] as string)}</span>
            )}
            <IconChevronRight size={16} aria-hidden />
          </UnstyledButton>
        ))}
      </>
    );
  } else {
    body = (
      <>
        <div className={classes.sheetHead}>
          <button
            type="button"
            className={classes.back}
            aria-label="Back to fields"
            onClick={() => setField(null)}
          >
            <IconChevronLeft size={18} aria-hidden />
          </button>
          <h2>{FIELD_LABELS[field]}</h2>
          <button
            type="button"
            className={classes.sheetAction}
            disabled={search[field] === undefined}
            onClick={() => onFilter(field, null)}
          >
            Clear
          </button>
        </div>
        <Values
          field={field}
          options={optionsFor(field, statuses, counts)}
          chosen={search[field] as string | undefined}
          onPick={(value) => onFilter(field, value)}
          touch
        />
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className={classes.control}
        aria-haspopup="dialog"
        aria-expanded={opened}
        onClick={() => setOpened(true)}
      >
        <FilterLabel applied={applied.length} />
      </button>
      <Drawer
        opened={opened}
        onClose={close}
        position="bottom"
        size="auto"
        withCloseButton={false}
        title="Filter"
        classNames={{
          content: classes.sheet,
          header: classes.hiddenHeader,
          body: classes.sheetBody,
        }}
      >
        {body}
        {show}
      </Drawer>
    </>
  );
}

/** The views as icons, the open one with its name too; always on the toolbar, never in a menu. */
function ViewSwitcher({ view, onView }: { view: View; onView: (view: View) => void }) {
  return (
    <div className={classes.views} role="group" aria-label="View">
      {VIEWS.map((option) => {
        const Icon = option.icon;
        const on = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            className={classes.view}
            aria-pressed={on}
            aria-label={on ? undefined : option.label}
            title={option.label}
            onClick={() => onView(option.value)}
          >
            <Icon size={15} aria-hidden />
            {on && option.label}
          </button>
        );
      })}
    </div>
  );
}

/** On a phone, where four view icons don't fit: one button opening the views. */
function ViewMenu({ view, onView }: { view: View; onView: (view: View) => void }) {
  const current = VIEWS.find((option) => option.value === view) ?? VIEWS[0];
  const Icon = current.icon;
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <button type="button" className={classes.control} aria-label={`View: ${current.label}`}>
          <Icon size={15} aria-hidden />
          <IconChevronDown size={13} aria-hidden />
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        {VIEWS.map((option) => {
          const OptionIcon = option.icon;
          return (
            <Menu.Item
              key={option.value}
              leftSection={<OptionIcon size={15} aria-hidden />}
              rightSection={option.value === view ? <IconCheck size={14} aria-hidden /> : null}
              onClick={() => onView(option.value)}
            >
              {option.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
