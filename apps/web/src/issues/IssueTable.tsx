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
import type { CanMove } from "./dragContext";
import { PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import {
  aimAt,
  describeEdge,
  describePlace,
  describeWhere,
  neighboursAt,
  nextPlace,
  placeOf,
  type Group,
  type Place,
} from "./keyboardDrag";
import { timeAgo } from "./timeAgo";
import classes from "./IssueViews.module.css";

type Sort = NonNullable<IssueSearch["sort"]>;

/** A row dropped in the Table: the keys of the rows directly above and below where it landed, of any Status. */
export type ReorderRow = (
  issueKey: string,
  after: string | undefined,
  before: string | undefined,
) => void;

/**
 * The Issues as a dense table. Rank, Priority and Updated sort on the server, so the arrow marks the one in use. In
 * Rank order (`onReorder`) each row the User may move has a grip at its start, shown on hover and focus: dragging it,
 * or lifting it with the keyboard, moves the row within the page shown and changes the Issue's Rank only, never its
 * Status. Only the grip drags, so the cells' text can still be selected and copied. Under the other sorts there are no
 * grips, and a hint says how to reorder.
 */
export function IssueTable({
  issues,
  sort,
  onSort,
  onReorder,
  canMove = () => true,
}: {
  issues: Issue[];
  sort: Sort;
  onSort: (sort: Sort) => void;
  onReorder?: ReorderRow;
  canMove?: CanMove;
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
        {onReorder && issues.some(canMove) && (
          <p className={classes.rankHint}>Sort by Rank to reorder</p>
        )}
        {table}
      </>
    );
  }
  return (
    <TableDrag issues={issues} onReorder={onReorder}>
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

/** dnd-kit's own announcements are off: the Table says what happens in its own live region. */
const SILENT = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

/** The Table's rows as the one group of places a carried row moves among (see keyboardDrag). */
function groupOf(keys: string[]): Group[] {
  return [{ id: "table", name: "the Table", keys }];
}

/**
 * Drag and drop for the Table's rows, by pointer from a grip or by keyboard on a focused grip. As on the Board, a
 * keyboard drag is kept as an index among the other rows (keyboardDrag), not worked out from boxes, and a drop sends
 * the rows directly above and below its place.
 */
function TableDrag({
  issues,
  onReorder,
  children,
}: {
  issues: Issue[];
  onReorder: ReorderRow;
  children: ReactNode;
}) {
  const keys = issues.map((issue) => issue.key);
  const [announcement, setAnnouncement] = useState("");
  // The rows as last rendered, for what dnd-kit calls between renders, and the keyboard drag's place.
  const latest = useRef(keys);
  const keyboard = useRef<{ key: string; index: number } | null>(null);
  useLayoutEffect(() => {
    latest.current = keys;
  });

  // Made once, reading the drag and the rows when called.
  const [handlers] = useState(() => ({
    /** A keyboard drag is over the row its place names, whatever the boxes say. */
    collisions: ((args) => {
      const drag = keyboard.current;
      if (drag) {
        const id = aimAt(groupOf(latest.current), drag.key, { group: 0, index: drag.index });
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
      const groups = groupOf(latest.current);
      const place = { group: 0, index: drag.index };
      const next = nextPlace(groups, drag.key, place, direction);
      if (next.index === place.index) {
        setAnnouncement(describeEdge(groups, drag.key, place, direction));
        return undefined;
      }
      drag.index = next.index;
      setAnnouncement(describePlace(groups, drag.key, next));
      const rect = droppableRects.get(aimAt(groups, drag.key, next));
      return { x: collisionRect.left, y: rect ? rect.top : collisionRect.top };
    }) as KeyboardCoordinateGetter,
  }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: handlers.coordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const at = (key: string, place: Place) => `at ${describeWhere(groupOf(keys), key, place)}`;

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
    setAnnouncement(`Picked up ${key} ${at(key, from)}.`);
    if (event.activatorEvent instanceof KeyboardEvent)
      keyboard.current = { key, index: from.index };
  }

  function over(event: DragOverEvent) {
    if (keyboard.current) return;
    const place = pointerPlace(event);
    if (place) setAnnouncement(describePlace(groupOf(keys), String(event.active.id), place));
  }

  function end(event: DragEndEvent) {
    const key = String(event.active.id);
    const drag = keyboard.current;
    keyboard.current = null;
    const groups = groupOf(keys);
    const from = placeOf(groups, key);
    const place = drag ? { group: 0, index: drag.index } : pointerPlace(event);
    if (!from) return;
    if (!place) {
      setAnnouncement(`${key} was put back ${at(key, from)}`);
      return;
    }
    setAnnouncement(`Dropped ${key} ${at(key, place)}`);
    if (place.index === from.index) return;
    const { after, before } = neighboursAt(groups, key, place);
    onReorder(key, after, before);
  }

  function cancel(event: { active: { id: string | number } }) {
    keyboard.current = null;
    const key = String(event.active.id);
    const from = placeOf(groupOf(keys), key);
    if (from) setAnnouncement(`${key} was put back ${at(key, from)}`);
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
