import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Fragment } from "react";
import {
  DragBoard,
  Gap,
  RowBody,
  SortableIssueCard,
  type Column,
  type DropIssue,
} from "./IssueBoard";
import { useDropSlot, useStatusArea, type CanMove } from "./dragContext";
import { StatusPill } from "./IssueMarks";
import classes from "./IssueViews.module.css";

/**
 * The List: the Issues grouped under their Status, every Status in order, in Rank order within each. A row is dragged
 * like a card on the Board (a short movement starts the drag, a click still opens the Issue): up or down within its
 * group, or between the rows of another (`onDrop`, with the Status of the group it lands in). A Status with no Issues
 * is a slim heading that says so, and a drop on it moves the Issue there. Nothing appears or goes while a row is
 * carried, so the rows never move under it.
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
      mode="list"
      overlay={(issue) => <RowBody issue={issue} lifted />}
      onDrop={onDrop}
      canMove={canMove}
    >
      <div className={classes.groups}>
        {columns.map((column) => (
          <Group key={column.status.id} column={column} />
        ))}
      </div>
    </DragBoard>
  );
}

function Group({ column }: { column: Column }) {
  const { setNodeRef, isOver } = useStatusArea(column.status.id, column.status);
  // The gap for a row carried in from another group opens where it will land: between the rows, or under the
  // heading of a Status with none.
  const slot = useDropSlot(column.status);
  const empty = column.items.length === 0;
  const gap = (at: number) =>
    slot?.at === at && (
      <li aria-hidden>
        <Gap height={slot.height} />
      </li>
    );
  return (
    <section
      ref={setNodeRef}
      className={`${classes.group} ${empty ? classes.emptyGroup : ""} ${isOver ? classes.over : ""}`}
      aria-label={column.status.name}
    >
      <div className={classes.groupHead}>
        <StatusPill status={column.status} />
        <span>{column.total}</span>
        {empty && column.total === 0 && <span className={classes.noIssues}>No issues</span>}
      </div>
      {empty ? (
        slot && <Gap height={slot.height} />
      ) : (
        <ul className={classes.groupRows}>
          <SortableContext
            items={column.items.map((issue) => issue.key)}
            strategy={verticalListSortingStrategy}
          >
            {column.items.map((issue, index) => (
              <Fragment key={issue.id}>
                {gap(index)}
                <li>
                  <SortableIssueCard issue={issue} row />
                </li>
              </Fragment>
            ))}
            {gap(column.items.length)}
          </SortableContext>
        </ul>
      )}
      {column.total > column.items.length && (
        <div className={classes.more}>
          Showing {column.items.length} of {column.total}
        </div>
      )}
    </section>
  );
}
