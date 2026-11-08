import { useDndContext } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Fragment, useContext } from "react";
import { Link } from "react-router";
import type { Issue, ProjectStatus } from "../api/client";
import { AssigneeMark, DragBoard, Gap, type Column, type DropIssue } from "./IssueBoard";
import {
  CanMoveContext,
  useCardDrop,
  useDropSlot,
  useStatusArea,
  type CanMove,
} from "./dragContext";
import { PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import classes from "./IssueViews.module.css";

/**
 * The List: the Issues grouped under their Status, in Rank order. A row is dragged like a card on the Board (a short
 * movement starts the drag, a click still opens the Issue): up or down within its group, or between the rows of
 * another (`onDrop`, with the Status of the group it lands in). A Status with no Issues is left out, except while a
 * row is carried: then it shows as a place to drop, since a move there is a move to that Status.
 */
export function IssueGroups({
  columns,
  onDrop,
  canMove = () => true,
}: {
  columns: Column[];
  onDrop: DropIssue;
  canMove?: CanMove;
}) {
  return (
    <DragBoard
      columns={columns}
      list
      overlay={(issue) => <RowBody issue={issue} lifted />}
      onDrop={onDrop}
      canMove={canMove}
    >
      <Groups columns={columns} />
    </DragBoard>
  );
}

function Groups({ columns }: { columns: Column[] }) {
  const carrying = useDndContext().active !== null;
  return (
    <div className={classes.groups}>
      {columns.map((column) =>
        column.items.length > 0 ? (
          <Group key={column.status.id} column={column} />
        ) : (
          carrying && <EmptyGroup key={column.status.id} status={column.status} />
        ),
      )}
    </div>
  );
}

function Group({ column }: { column: Column }) {
  const { setNodeRef, isOver } = useStatusArea(column.status.id, column.status);
  // The gap for a row carried in from another group opens where it will land, between the rows.
  const slot = useDropSlot(column.status);
  const gap = (at: number) =>
    slot?.at === at && (
      <li aria-hidden>
        <Gap height={slot.height} />
      </li>
    );
  return (
    <section
      ref={setNodeRef}
      className={`${classes.group} ${isOver ? classes.over : ""}`}
      aria-label={column.status.name}
    >
      <div className={classes.groupHead}>
        <StatusPill status={column.status} />
        <span>{column.total}</span>
      </div>
      <ul className={classes.groupRows}>
        <SortableContext
          items={column.items.map((issue) => issue.key)}
          strategy={verticalListSortingStrategy}
        >
          {column.items.map((issue, index) => (
            <Fragment key={issue.id}>
              {gap(index)}
              <li>
                <SortableRow issue={issue} />
              </li>
            </Fragment>
          ))}
          {gap(column.items.length)}
        </SortableContext>
      </ul>
      {column.total > column.items.length && (
        <div className={classes.more}>
          Showing {column.items.length} of {column.total}
        </div>
      )}
    </section>
  );
}

/** A Status with no Issues, shown while a row is carried: a place to drop it, which moves it to this Status. */
function EmptyGroup({ status }: { status: ProjectStatus }) {
  const { setNodeRef, isOver } = useStatusArea(status.id, status);
  return (
    <section
      ref={setNodeRef}
      className={`${classes.emptyDrop} ${isOver ? classes.over : ""}`}
      aria-label={status.name}
    >
      Drop here to move to {status.name}
    </section>
  );
}

/** What a row shows; the carried one too (`lifted`). */
function RowBody({ issue, lifted = false }: { issue: Issue; lifted?: boolean }) {
  return (
    <div className={`${classes.groupRow} ${lifted ? classes.lifted : ""}`}>
      <TypeBadge type={issue.type} />
      <span className={classes.rowKey}>{issue.key}</span>
      <span className={classes.rowTitle}>{issue.title}</span>
      <span className={classes.rowStatus}>
        <StatusPill status={issue.status} />
      </span>
      <PriorityMark priority={issue.priority} />
      <AssigneeMark issue={issue} size={24} />
    </div>
  );
}

/**
 * A row that opens the Issue, can be dragged, and is dropped on, so the rows of its group slide apart to open a gap
 * where the carried row would land. A row the User may not move can't be dragged but still takes drops.
 */
function SortableRow({ issue }: { issue: Issue }) {
  const canMove = useContext(CanMoveContext);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.key,
    data: { issue, status: issue.status },
    disabled: { draggable: !canMove(issue), droppable: false },
    // The drop is animated by the Board's dropAnimation; sortable's own slide would play on top and jump twice.
    animateLayoutChanges: () => false,
  });
  const { leaving } = useCardDrop(issue);
  return (
    <Link
      ref={setNodeRef}
      to={`/issues/${encodeURIComponent(issue.key)}`}
      className={`${classes.groupRowLink} ${isDragging ? classes.placeholder : ""} ${leaving ? classes.leaving : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The browser's own link dragging would fight the drag.
      draggable={false}
      data-issue={issue.key}
      {...attributes}
      {...listeners}
      role="link"
    >
      <RowBody issue={issue} />
    </Link>
  );
}
