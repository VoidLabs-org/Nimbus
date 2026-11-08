import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VisuallyHidden } from "@mantine/core";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Issue, IssueSearch } from "../api/client";
import { SILENT, type CanMove } from "./dragContext";
import { PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import { aimAt, neighboursAt, nextPlace, placeOf, type Group, type Place } from "./keyboardDrag";
import { timeAgo } from "./timeAgo";
import classes from "./IssueViews.module.css";

type Sort = NonNullable<IssueSearch["sort"]>;

/** A row dropped in the Table: the keys of the rows directly above and below where it landed, of any Status. */
export type ReorderRow = (
  issueKey: string,
  after: string | undefined,
  before: string | undefined,
) => Promise<boolean> | void;

/**
 * The Issues as a dense table. Rank, Priority and Updated sort on the server, so the arrow marks the one in use. In
 * Rank order (`onReorder`, left out while the rows shown are not yet the ones asked for) each row the User may move
 * (`canMove`; none unless given) has a grip at its start, shown on hover and focus: dragging it,
 * or lifting it with the keyboard, moves the row within the page shown and changes the Issue's Rank only, never its
 * Status. Only the grip drags, so the cells' text can still be selected and copied. Under the other sorts there are no
 * grips, and a hint says how to reorder.
 */
export function IssueTable({
  issues,
  sort,
  onSort,
  onReorder,
  canMove = () => false,
  offset = 0,
  total = issues.length,
}: {
  issues: Issue[];
  sort: Sort;
  onSort: (sort: Sort) => void;
  onReorder?: ReorderRow;
  canMove?: CanMove;
  /** The first row's place in the whole order (the rows on the pages before), and how many Issues there are. */
  offset?: number;
  total?: number;
}) {
  const ranked = sort === "rank" && onReorder !== undefined;
  const sortable = (name: Sort, label: string) => (
    <button
      type="button"
      className={classes.sortButton}
      aria-pressed={sort === name}
      onClick={() => onSort(name)}
    >
      {label}
      {sort === name ? " ↓" : ""}
    </button>
  );
  const table = (
    <div className={classes.tableWrap}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th scope="col" className={classes.gripCell}>
              {sortable("rank", "Rank")}
            </th>
            <th scope="col">Key</th>
            <th scope="col">Title</th>
            <th scope="col">Status</th>
            <th scope="col">{sortable("priority", "Priority")}</th>
            <th scope="col">Assignee</th>
            <th scope="col">Type</th>
            <th scope="col">{sortable("updated", "Updated")}</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) =>
            ranked ? (
              <SortableRow key={issue.id} issue={issue} movable={canMove(issue)} />
            ) : (
              <tr key={issue.id}>
                <td className={classes.gripCell} />
                <Cells issue={issue} />
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
  if (!ranked) {
    return (
      <>
        {sort !== "rank" && onReorder && issues.some(canMove) && (
          <p className={classes.rankHint}>Sort by Rank to reorder</p>
        )}
        {table}
      </>
    );
  }
  return (
    <TableDrag issues={issues} offset={offset} total={total} onReorder={onReorder}>
      {table}
    </TableDrag>
  );
}

function Cells({ issue }: { issue: Issue }) {
  return (
    <>
      <td className={classes.cardKey}>{issue.key}</td>
      <td>
        <Link to={`/issues/${encodeURIComponent(issue.key)}`} className={classes.titleLink}>
          {issue.title}
        </Link>
      </td>
      <td>
        <StatusPill status={issue.status} />
      </td>
      <td>
        <span className={classes.person}>
          <PriorityMark priority={issue.priority} />
          {issue.priority}
        </span>
      </td>
      <td>
        <span className={classes.person}>
          {issue.assignee ? (
            <>
              <ProfilePicture
                name={issue.assignee.displayName}
                src={issue.assignee.avatarUrl}
                size={22}
              />
              {issue.assignee.displayName}
            </>
          ) : (
            <>
              <span className={classes.nobody} aria-hidden />
              Unassigned
            </>
          )}
        </span>
      </td>
      <td>
        <span className={classes.person}>
          <TypeBadge type={issue.type} />
          {issue.type}
        </span>
      </td>
      <td title={new Date(issue.updatedAt).toLocaleString()}>{timeAgo(issue.updatedAt)}</td>
    </>
  );
}

/** A row in Rank order: the rows slide apart around a carried one, which is moved by its grip only. */
function SortableRow({ issue, movable }: { issue: Issue; movable: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.key, disabled: { draggable: !movable, droppable: false } });
  return (
    <tr
      ref={setNodeRef}
      className={isDragging ? classes.rowCarried : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-issue={issue.key}
    >
      <td className={classes.gripCell}>
        {movable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={classes.grip}
            aria-label={`Reorder ${issue.key}`}
            {...attributes}
            {...listeners}
          >
            <span aria-hidden>⋮⋮</span>
          </button>
        )}
      </td>
      <Cells issue={issue} />
    </tr>
  );
}

const INSTRUCTIONS = {
  draggable:
    "To reorder this Issue, press Space. Up and Down move it one row. Press Space to drop it, or Escape to put it back.",
};

/** The Table's rows as the one group of places a carried row moves among (see keyboardDrag). */
function groupOf(keys: string[]): Group[] {
  return [{ id: "table", name: "the Table", keys }];
}

/**
 * A keyboard drag: the row, and its place kept as the rows it is between (`after`, `before`) as well as its index, so
 * a refresh while it is carried (an earlier drop settling, say) keeps it between the same rows rather than at the
 * same index among different ones.
 */
type KeyboardDrag = { key: string; index: number; after?: string; before?: string };

/** The drag's index among the other rows as they are now: next to the rows it was between, if still there. */
function indexNow(keys: string[], drag: KeyboardDrag) {
  const others = keys.filter((key) => key !== drag.key);
  if (drag.before !== undefined && others.includes(drag.before)) return others.indexOf(drag.before);
  if (drag.after !== undefined && others.includes(drag.after))
    return others.indexOf(drag.after) + 1;
  return Math.min(drag.index, others.length);
}

/**
 * Drag and drop for the Table's rows, by pointer from a grip or by keyboard on a focused grip. A keyboard drag is
 * kept as a place among the other rows (keyboardDrag), not worked out from boxes, and a drop sends the rows directly
 * above and below its place. The live region counts places in the whole Rank order (`offset` is the first row's
 * place, `total` all of the Issues), since a page is only part of it.
 */
function TableDrag({
  issues,
  offset,
  total,
  onReorder,
  children,
}: {
  issues: Issue[];
  offset: number;
  total: number;
  onReorder: ReorderRow;
  children: ReactNode;
}) {
  const keys = issues.map((issue) => issue.key);
  const [announcement, setAnnouncement] = useState("");
  // The rows as last rendered and the counting, for what dnd-kit calls between renders, and the keyboard drag.
  const latest = useRef({ keys, offset, total });
  const keyboard = useRef<KeyboardDrag | null>(null);
  useLayoutEffect(() => {
    latest.current = { keys, offset, total };
  });

  // Made once, reading the drag and the rows when called.
  const [handlers] = useState(() => {
    /** "position 52 of 120 in the Table", counting the whole order. */
    const where = (index: number) => {
      const { keys, offset, total } = latest.current;
      return `position ${offset + index + 1} of ${Math.max(total, offset + keys.length)} in the Table`;
    };
    return {
      where,
      /** A keyboard drag is over the row its place names, whatever the boxes say. */
      collisions: ((args) => {
        const drag = keyboard.current;
        if (drag) {
          const keys = latest.current.keys;
          const index = indexNow(keys, drag);
          const id = aimAt(groupOf(keys), drag.key, { group: 0, index });
          const container = args.droppableContainers.find((c) => c.id === id);
          if (container) return [{ id, data: { droppableContainer: container, value: 0 } }];
        }
        return closestCenter(args);
      }) as CollisionDetection,
      /** Up and Down move the row one place; a key that can't move it further says so. */
      coordinates: ((event, { context }) => {
        const drag = keyboard.current;
        const direction =
          event.code === "ArrowUp" ? "up" : event.code === "ArrowDown" ? "down" : undefined;
        const { collisionRect, droppableRects } = context;
        if (!drag || !direction || !collisionRect) return undefined;
        event.preventDefault();
        const { keys, offset, total } = latest.current;
        const groups = groupOf(keys);
        const place = { group: 0, index: indexNow(keys, drag) };
        const next = nextPlace(groups, drag.key, place, direction);
        if (next.index === place.index) {
          // The first or last row of a page that isn't the whole order: there is more beyond it.
          const more =
            direction === "up" ? offset > 0 : offset + keys.length < Math.max(total, keys.length);
          const end = direction === "up" ? "first" : "last";
          setAnnouncement(
            `${drag.key} is already ${end} ${more ? "on this page" : "in the Table"}`,
          );
          return undefined;
        }
        Object.assign(drag, { index: next.index }, neighboursAt(groups, drag.key, next));
        setAnnouncement(`${drag.key}, ${where(next.index)}`);
        const rect = droppableRects.get(aimAt(groups, drag.key, next));
        return { x: collisionRect.left, y: rect ? rect.top : collisionRect.top };
      }) as KeyboardCoordinateGetter,
    };
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: handlers.coordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const at = (index: number) => `at ${handlers.where(index)}`;

  /** Where a pointer drag would land: the place of the row under it (the row takes that row's place). */
  function pointerPlace(event: Pick<DragEndEvent, "over">): Place | null {
    const index = event.over ? keys.indexOf(String(event.over.id)) : -1;
    return index < 0 ? null : { group: 0, index };
  }

  function start(event: DragStartEvent) {
    const key = String(event.active.id);
    const from = placeOf(groupOf(keys), key);
    keyboard.current = null;
    if (!from) return;
    setAnnouncement(`Picked up ${key} ${at(from.index)}.`);
    if (event.activatorEvent instanceof KeyboardEvent) {
      keyboard.current = { key, index: from.index, ...neighboursAt(groupOf(keys), key, from) };
    }
  }

  function over(event: DragOverEvent) {
    if (keyboard.current) return;
    const place = pointerPlace(event);
    if (place) setAnnouncement(`${String(event.active.id)}, ${handlers.where(place.index)}`);
  }

  function end(event: DragEndEvent) {
    const key = String(event.active.id);
    const drag = keyboard.current;
    keyboard.current = null;
    const groups = groupOf(keys);
    const from = placeOf(groups, key);
    const place = drag ? { group: 0, index: indexNow(keys, drag) } : pointerPlace(event);
    if (!from) return;
    if (!place) {
      setAnnouncement(`${key} was put back ${at(from.index)}`);
      return;
    }
    setAnnouncement(`Dropped ${key} ${at(place.index)}`);
    if (place.index === from.index) return;
    const { after, before } = neighboursAt(groups, key, place);
    // If the server refuses, the row goes back: say so, or the live region would still say it was dropped.
    void Promise.resolve(onReorder(key, after, before)).then((saved) => {
      if (saved === false) {
        setAnnouncement(`Couldn't reorder ${key}. It is back ${at(from.index)}`);
      }
    });
  }

  function cancel(event: { active: { id: string | number } }) {
    keyboard.current = null;
    const key = String(event.active.id);
    const from = placeOf(groupOf(keys), key);
    if (from) setAnnouncement(`${key} was put back ${at(from.index)}`);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        accessibility={{ announcements: SILENT, screenReaderInstructions: INSTRUCTIONS }}
        collisionDetection={handlers.collisions}
        onDragStart={start}
        onDragOver={over}
        onDragEnd={end}
        onDragCancel={cancel}
      >
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
      <VisuallyHidden aria-live="assertive" aria-atomic aria-label="Moving rows">
        {announcement}
      </VisuallyHidden>
    </>
  );
}
