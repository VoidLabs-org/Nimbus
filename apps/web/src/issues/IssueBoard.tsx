import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { VisuallyHidden } from "@mantine/core";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Issue, ProjectStatus } from "../api/client";
import { PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import classes from "./IssueViews.module.css";

/** One Status and the Issues the server sent for it; `total` counts all of them, which may be more than shown. */
export type Column = { status: ProjectStatus; items: Issue[]; total: number };

export type MoveIssue = (issueKey: string, status: ProjectStatus) => void;

/** Under the pointer when there is one; the nearest drop area otherwise (the keyboard has no pointer). */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

/** The arrow keys carry a lifted card to the nearest drop area in that direction, so one press changes a Status. */
const keyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { droppableRects, droppableContainers, collisionRect } },
) => {
  const direction = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowDown: [0, 1],
    ArrowUp: [0, -1],
  }[event.code];
  if (!direction || !collisionRect) return undefined;
  event.preventDefault();
  const here = {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  let best: { x: number; y: number; distance: number } | undefined;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const dx = rect.left + rect.width / 2 - here.x;
    const dy = rect.top + rect.height / 2 - here.y;
    // Only areas further along the pressed direction, and mostly along it.
    const along = dx * direction[0]! + dy * direction[1]!;
    const across = Math.abs(dx * direction[1]! + dy * direction[0]!);
    if (along <= 1 || across > along) continue;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) {
      best = {
        x: here.x + dx - collisionRect.width / 2,
        y: here.y + dy - collisionRect.height / 2,
        distance,
      };
    }
  }
  return best && { x: best.x, y: best.y };
};

/**
 * Drag and drop for the Board and the Swimlanes: a mouse, a finger or the keyboard (Space lifts a card, the arrows
 * carry it, Space drops it). The drop areas say which Status they stand for; dropping calls `onMove`.
 */
function DragBoard({
  issues,
  onMove,
  children,
}: {
  issues: Issue[];
  onMove: MoveIssue;
  children: ReactNode;
}) {
  const [lifted, setLifted] = useState<Issue | null>(null);
  const sensors = useSensors(
    // A short drag, so a plain click still opens the Issue.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  function start(event: DragStartEvent) {
    setLifted(issues.find((issue) => issue.key === event.active.id) ?? null);
  }

  function end(event: DragEndEvent) {
    setLifted(null);
    const status = event.over?.data.current?.status as ProjectStatus | undefined;
    if (status) onMove(String(event.active.id), status);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setLifted(null)}
    >
      {children}
      <DragOverlay>{lifted && <CardBody issue={lifted} lifted />}</DragOverlay>
    </DndContext>
  );
}

/** The Assignee as a picture, or an empty ring; the name is there for screen readers. */
export function AssigneeMark({ issue, size = 22 }: { issue: Issue; size?: number }) {
  return issue.assignee ? (
    <>
      <ProfilePicture
        name={issue.assignee.displayName}
        src={issue.assignee.avatarUrl}
        size={size}
      />
      <VisuallyHidden>{issue.assignee.displayName}</VisuallyHidden>
    </>
  ) : (
    <>
      <span className={classes.nobody} aria-hidden />
      <VisuallyHidden>Unassigned</VisuallyHidden>
    </>
  );
}

function CardBody({ issue, lifted = false }: { issue: Issue; lifted?: boolean }) {
  return (
    <div className={`${classes.card} ${lifted ? classes.lifted : ""}`}>
      <span className={classes.cardTitle}>{issue.title}</span>
      <span className={classes.cardMeta}>
        <TypeBadge type={issue.type} />
        <span className={classes.cardKey}>{issue.key}</span>
        <span className={classes.spacer} />
        <PriorityMark priority={issue.priority} />
        <AssigneeMark issue={issue} />
      </span>
    </div>
  );
}

/** An Issue as a card that opens the Issue and can be dragged; where it was shows as a dashed outline meanwhile. */
function IssueCard({ issue }: { issue: Issue }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.key });
  return (
    <Link
      ref={setNodeRef}
      to={`/issues/${encodeURIComponent(issue.key)}`}
      className={`${classes.cardLink} ${isDragging ? classes.placeholder : ""}`}
      // The browser's own link dragging would fight the drag.
      draggable={false}
      {...attributes}
      role="link"
      {...listeners}
    >
      <CardBody issue={issue} />
    </Link>
  );
}

function useStatusArea(id: string, status: ProjectStatus) {
  return useDroppable({ id, data: { status } });
}

/** The Board: a column for each Status, in order. Dropping a card on a column moves the Issue to that Status. */
export function IssueBoard({ columns, onMove }: { columns: Column[]; onMove: MoveIssue }) {
  return (
    <DragBoard issues={columns.flatMap((column) => column.items)} onMove={onMove}>
      <div className={classes.board}>
        {columns.map((column) => (
          <BoardColumn key={column.status.id} column={column} />
        ))}
      </div>
    </DragBoard>
  );
}

function BoardColumn({ column }: { column: Column }) {
  const { setNodeRef, isOver } = useStatusArea(column.status.id, column.status);
  return (
    <section
      ref={setNodeRef}
      className={`${classes.column} ${isOver ? classes.over : ""}`}
      aria-label={column.status.name}
    >
      <div className={classes.columnHead}>
        <StatusPill status={column.status} />
        <span>{column.total}</span>
      </div>
      {column.items.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
      {column.total > column.items.length && (
        <div className={classes.more}>
          Showing {column.items.length} of {column.total}
        </div>
      )}
    </section>
  );
}

/** One row of the Swimlanes: who it is for, and their Issues. */
type Lane = { id: string; name: string | null; avatarUrl: string | null; issues: Issue[] };

/** Lanes by Assignee, in the order they first appear, with Unassigned last. */
function lanesOf(columns: Column[]): Lane[] {
  const lanes = new Map<string, Lane>();
  const unassigned: Lane = { id: "none", name: null, avatarUrl: null, issues: [] };
  for (const issue of columns.flatMap((column) => column.items)) {
    if (!issue.assignee) {
      unassigned.issues.push(issue);
      continue;
    }
    const lane = lanes.get(issue.assignee.id) ?? {
      id: issue.assignee.id,
      name: issue.assignee.displayName,
      avatarUrl: issue.assignee.avatarUrl,
      issues: [],
    };
    lane.issues.push(issue);
    lanes.set(issue.assignee.id, lane);
  }
  return [...lanes.values(), ...(unassigned.issues.length > 0 ? [unassigned] : [])];
}

/** Swimlanes: the Board, grouped by Assignee. Dropping on a cell changes the Status only, never the Assignee. */
export function IssueSwimlanes({ columns, onMove }: { columns: Column[]; onMove: MoveIssue }) {
  const lanes = lanesOf(columns);
  return (
    <DragBoard issues={columns.flatMap((column) => column.items)} onMove={onMove}>
      <div
        className={classes.lanes}
        style={{ gridTemplateColumns: `140px repeat(${columns.length}, minmax(200px, 1fr))` }}
      >
        <div className={classes.columnHead}>
          Group by&nbsp;<b>Assignee</b>
        </div>
        {columns.map((column) => (
          <div key={column.status.id} className={`${classes.columnHead} ${classes.statusHead}`}>
            <StatusPill status={column.status} />
          </div>
        ))}
        {lanes.map((lane) => (
          <LaneRow key={lane.id} lane={lane} columns={columns} />
        ))}
      </div>
    </DragBoard>
  );
}

function LaneRow({ lane, columns }: { lane: Lane; columns: Column[] }) {
  return (
    <>
      <div className={classes.laneHead}>
        {lane.name ? (
          <ProfilePicture name={lane.name} src={lane.avatarUrl} size={24} />
        ) : (
          <span className={classes.nobody} aria-hidden />
        )}
        <span>
          {lane.name ?? "Unassigned"}{" "}
          <span className={classes.laneCount}>{lane.issues.length}</span>
        </span>
      </div>
      {columns.map((column) => (
        <LaneCell
          key={column.status.id}
          laneId={lane.id}
          status={column.status}
          issues={lane.issues.filter((issue) => issue.status.id === column.status.id)}
          label={`${lane.name ?? "Unassigned"}, ${column.status.name}`}
        />
      ))}
    </>
  );
}

function LaneCell({
  laneId,
  status,
  issues,
  label,
}: {
  laneId: string;
  status: ProjectStatus;
  issues: Issue[];
  label: string;
}) {
  const { setNodeRef, isOver } = useStatusArea(`${laneId}:${status.id}`, status);
  return (
    <div
      ref={setNodeRef}
      className={`${classes.cell} ${isOver ? classes.over : ""}`}
      role="group"
      aria-label={label}
    >
      {issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
