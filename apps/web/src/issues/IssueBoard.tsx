import {
  closestCenter,
  DndContext,
  DragOverlay,
  getClientRect,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimationFunction,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VisuallyHidden } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { ProfilePicture } from "@repo/ui/profile-picture";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import type { Issue, ProjectStatus } from "../api/client";
import { PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import classes from "./IssueViews.module.css";

/** One Status and the Issues the server sent for it; `total` counts all of them, which may be more than shown. */
export type Column = { status: ProjectStatus; items: Issue[]; total: number };

export type MoveIssue = (issueKey: string, status: ProjectStatus) => void;

/** An Issue dropped between two cards of its own column: the keys of the cards directly above and below it. */
export type ReorderIssue = (
  issueKey: string,
  after: string | undefined,
  before: string | undefined,
) => void;

/** Whether the User may move an Issue; a card they can't move is not draggable. Everything is allowed by default. */
export type CanMove = (issue: Issue) => boolean;

const CanMoveContext = createContext<CanMove>(() => true);

/**
 * The Issue just dropped and the Status it was dropped in (its own, for a drop that moves nothing). While `moving`,
 * its card is hidden wherever it is: in its old column until the Board shows the move (a moment later: TanStack Query
 * tells React on its next tick), and in its new place until the carried card has glided there, which then shows it
 * (see dropAnimation), so there are never two at once. Without animation (`animated` false) only the old place is
 * hidden. A card that `moved` and is in that Status gets its outline traced; if the move fails it is back where it
 * was, untraced.
 */
type Drop = { key: string; status: string; moved: boolean; animated: boolean; moving: boolean };

const DropContext = createContext<Drop | null>(null);

/** Where a carried card would land if dropped now: its Issue, the Status under it and the card's height. */
type Target = { issue: Issue; status: string; height: number | undefined };

const TargetContext = createContext<Target | null>(null);

/**
 * On a drop, the carried card glides into the place where the Issue now is (the move is optimistic, so that is its new
 * column) and straightens up as it lands; the card itself stays hidden until it arrives.
 *
 * A move into another column shows a card-sized gap where the card will land (DropSlot); the drop handler keeps its
 * position in `landing`, so the glide starts at once, however long the Board takes to show the move. Without a gap (a
 * reorder, where the card is only a little way off) there is nothing to go by: dnd-kit's own drop animation would
 * measure the card at once, but the Board only shows the change a moment later (TanStack Query tells React on its next
 * tick, a timeout), so the card would fly back to where it was. This one then waits for that timeout and the render
 * after it, and finds the card wherever it now is.
 */
/** Where the gap for the move being dropped was; there is only ever one drag at a time. */
const landing: { current: DOMRect | null } = { current: null };

const dropAnimation = makeDropAnimation();

/**
 * The card the drop animation showed with an inline `visibility`, while its Drop still hides it. A card that stays in
 * the same column is the same element on its next drop, so the inline style has to go once the Drop is over, or it
 * would keep winning over the class that hides the card during that next drop.
 */
let revealed: HTMLElement | null = null;

function clearRevealed() {
  revealed?.style.removeProperty("visibility");
  revealed = null;
}

function makeDropAnimation(): DropAnimationFunction {
  return async ({ active, dragOverlay, draggableNodes, transform }) => {
    dropping = false;
    let to = landing.current;
    landing.current = null;
    let card: HTMLElement | null = null;
    if (!to) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      card = draggableNodes.get(active.id)?.node.current ?? null;
      if (!card || !card.isConnected) return;
      revealInColumn(card);
      to = card.getBoundingClientRect();
    }
    const from = dragOverlay.node.getBoundingClientRect();
    const end = {
      ...transform,
      x: transform.x + to.left - from.left,
      y: transform.y + to.top - from.top,
    };
    const opacity = card?.style.opacity ?? "";
    if (card) {
      card.style.opacity = "0";
      // Hidden by its Drop until now; shown under the carried card the moment it lands (the inline style wins).
      card.style.visibility = "visible";
    }
    dragOverlay.node.classList.add(classes.dropping!);
    // Sticky: it is pulled into place, overshoots a hair, presses in as it lands, then settles.
    const there = CSS.Transform.toString(end);
    const animation = dragOverlay.node.animate(
      [
        {
          transform: CSS.Transform.toString(transform),
          easing: "cubic-bezier(0.34, 1.4, 0.64, 1)",
        },
        {
          transform: `${there} scale(0.96)`,
          offset: 0.7,
          easing: "cubic-bezier(0.3, 0, 0.3, 1.6)",
        },
        { transform: `${there} scale(1)` },
      ],
      { duration: 340, fill: "forwards" },
    );
    try {
      await animation.finished;
    } finally {
      if (card) card.style.opacity = opacity;
    }
    if (card) {
      revealed = card;
      return;
    }
    // The card was not looked for before: it is in its new column by now, hidden by its Drop; show it under the
    // carried card, which goes the moment this returns (a few frames at most, if the Board is slow).
    for (let frame = 0; frame < 10; frame++) {
      const arrived = draggableNodes.get(active.id)?.node.current;
      if (arrived?.isConnected) {
        arrived.style.visibility = "visible";
        revealed = arrived;
        revealInColumn(arrived);
        return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };
}

/**
 * Near an edge, dnd-kit scrolls whatever can scroll under the card, the browser window included: carrying a card near
 * the bottom of a long column scrolled the page too, and it stayed scrolled after the drop. Only the Board's own
 * scrollers (a column's cards, the Board and the Swimlanes sideways) follow the card.
 */
const autoScroll = {
  canScroll: (element: Element) =>
    element.matches(`.${classes.cards!}, .${classes.board!}, .${classes.lanes!}`),
};

/**
 * True from a drop until its animation starts. Just before it calls the animation, dnd-kit scrolls the dropped card
 * into view if its slot is off screen (a column scrolled away from where the card started, say), and that scrolled the
 * column and the whole page to the card's old place. The animation finds the card's new place itself, so the scroll is
 * never wanted: for these few moments the card measures as being in view, and dnd-kit leaves the scrolling alone.
 */
let dropping = false;

const IN_VIEW = { top: 0, left: 0, right: 1, bottom: 1, width: 1, height: 1 };

const measuring = {
  draggable: {
    measure: (element: HTMLElement) =>
      dropping ? IN_VIEW : getClientRect(element, { ignoreTransform: true }),
  },
};

/**
 * Scrolls the dropped card's column (only that: never the page) just enough to show the card, since a drop can put it
 * out of the part of the column in view: the column keeps its scroll while the card moves to another place in it.
 */
function revealInColumn(card: HTMLElement) {
  const list = card.closest<HTMLElement>(`.${classes.cards!}`);
  if (!list) return;
  const inner = card.getBoundingClientRect();
  const outer = list.getBoundingClientRect();
  const margin = 8;
  if (inner.top < outer.top) list.scrollTop -= outer.top - inner.top + margin;
  else if (inner.bottom > outer.bottom) list.scrollTop += inner.bottom - outer.bottom + margin;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Under the pointer when there is one; the nearest drop area otherwise (the keyboard has no pointer). A card under
 * the pointer wins over its column; over a column's bare space (a gap between cards, below the last one) it is the
 * column's nearest card, so a drop there still lands somewhere in that column.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return closestCenter(args);
  const dataOf = (collision: Collision) => collision.data?.droppableContainer.data.current;
  const card = within.find((collision) => dataOf(collision)?.issue);
  if (card) return [card];
  const status = dataOf(within[0]!)?.status as ProjectStatus | undefined;
  if (!status) return within;
  const nearest = closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => {
      const data = c.data.current;
      return data?.issue && (data.status as ProjectStatus).id === status.id;
    }),
  });
  return nearest.length > 0 ? nearest : within;
};

/**
 * The arrow keys carry a lifted card to the nearest drop area in that direction: the next card of its column (a
 * drop there is a reorder), or another column's card or bare space (a drop there changes the Status).
 */
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
  onReorder,
  canMove,
  children,
}: {
  issues: Issue[];
  onMove: MoveIssue;
  onReorder?: ReorderIssue;
  canMove: CanMove;
  children: ReactNode;
}) {
  const [lifted, setLifted] = useState<Issue | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dropKey = drop && `${drop.key}:${drop.status}`;
  useEffect(() => {
    if (!dropKey) return;
    // Past the drop animation, a card still where it was (the move failed) shows again; the trace is done by 1.5s.
    const shown = setTimeout(() => {
      setDrop((now) => now && { ...now, moving: false });
      clearRevealed();
    }, 600);
    const done = setTimeout(() => setDrop(null), 1500);
    return () => {
      clearTimeout(shown);
      clearTimeout(done);
    };
  }, [dropKey]);
  const sensors = useSensors(
    // A short drag, so a plain click still opens the Issue.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  function start(event: DragStartEvent) {
    dropping = false;
    clearRevealed();
    setDrop(null);
    setLifted(issues.find((issue) => issue.key === event.active.id) ?? null);
  }

  // Only when the area under the card changes, so the drop areas don't re-render on every pointer move.
  function over(event: DragOverEvent) {
    const status = event.over?.data.current?.status as ProjectStatus | undefined;
    const issue = event.active.data.current?.issue as Issue | undefined;
    setTarget(
      status && issue
        ? { issue, status: status.id, height: event.active.rect.current.initial?.height }
        : null,
    );
  }

  function end(event: DragEndEvent) {
    // Only an animation clears these, and with reduced motion there is none.
    const animated = !prefersReducedMotion();
    dropping = animated;
    const status = event.over?.data.current?.status as ProjectStatus | undefined;
    const issue = issues.find((item) => item.key === event.active.id);
    const moved = status !== undefined && issue !== undefined && issue.status.id !== status.id;
    // Dropped on a card of its own column: it takes that card's place, and the cards between shift by one.
    const overKey = (event.over?.data.current?.issue as Issue | undefined)?.key;
    const reorder =
      onReorder && issue && status && !moved && overKey !== undefined
        ? reorderedBetween(issues, issue, overKey)
        : undefined;
    landing.current =
      moved && animated
        ? (document.querySelector("[data-drop-slot]")?.getBoundingClientRect() ?? null)
        : null;
    if (issue && (moved || animated)) {
      setDrop({
        key: issue.key,
        status: status?.id ?? issue.status.id,
        moved,
        animated,
        moving: true,
      });
    }
    setLifted(null);
    setTarget(null);
    if (reorder && issue) onReorder?.(issue.key, reorder.after, reorder.before);
    else if (status) onMove(String(event.active.id), status);
  }

  function cancel() {
    dropping = false;
    setLifted(null);
    setTarget(null);
  }

  return (
    <CanMoveContext value={canMove}>
      <DropContext value={drop}>
        <TargetContext value={target}>
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            autoScroll={autoScroll}
            measuring={measuring}
            onDragStart={start}
            onDragOver={over}
            onDragEnd={end}
            onDragCancel={cancel}
          >
            {children}
            <DragOverlay dropAnimation={prefersReducedMotion() ? null : dropAnimation}>
              {lifted && <CardBody issue={lifted} lifted />}
            </DragOverlay>
          </DndContext>
        </TargetContext>
      </DropContext>
    </CanMoveContext>
  );
}

/**
 * Where an Issue lands when dropped on the card `overKey` of its own column: the cards directly above and below it
 * there (`issues` are all the Board's, in column order), or nothing when it stays where it was.
 */
function reorderedBetween(issues: Issue[], issue: Issue, overKey: string) {
  const column = issues.filter((item) => item.status.id === issue.status.id);
  const from = column.findIndex((item) => item.key === issue.key);
  const to = column.findIndex((item) => item.key === overKey);
  if (from < 0 || to < 0 || from === to) return undefined;
  const placed = arrayMove(column, from, to);
  return { after: placed[to - 1]?.key, before: placed[to + 1]?.key };
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

/** The classes that show a card's part in a drop (see Drop). */
function useCardDrop(issue: Issue) {
  const drop = useContext(DropContext);
  const dropped = drop?.key === issue.key;
  const there = dropped && issue.status.id === drop.status;
  const landed = there && drop.moved;
  const leaving = dropped && drop.moving && (drop.animated || !there);
  return { landed, leaving };
}

function CardLink({
  issue,
  dragging,
  handles,
  nodeRef,
  style,
}: {
  issue: Issue;
  dragging: boolean;
  handles: object;
  nodeRef: (node: HTMLElement | null) => void;
  style?: CSSProperties;
}) {
  const { landed, leaving } = useCardDrop(issue);
  return (
    <Link
      ref={nodeRef}
      to={`/issues/${encodeURIComponent(issue.key)}`}
      className={`${classes.cardLink} ${dragging ? classes.placeholder : ""} ${landed ? classes.landed : ""} ${leaving ? classes.leaving : ""}`}
      style={style}
      // The browser's own link dragging would fight the drag.
      draggable={false}
      {...handles}
      role="link"
    >
      <CardBody issue={issue} />
    </Link>
  );
}

/**
 * An Issue as a card that opens the Issue and can be dragged; where it was shows as a dashed outline meanwhile, and
 * its outline is traced once when it lands in a new Status (see Drop).
 */
function IssueCard({ issue }: { issue: Issue }) {
  const canMove = useContext(CanMoveContext);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: issue.key,
    data: { issue },
    disabled: !canMove(issue),
  });
  return (
    <CardLink
      issue={issue}
      dragging={isDragging}
      nodeRef={setNodeRef}
      handles={{ ...attributes, ...listeners }}
    />
  );
}

/**
 * A card in a Board column: dragged like {@link IssueCard}, and also dropped on, so the cards of its column slide
 * apart to open a gap where the carried card would land. A card the User may not move can't be dragged but still
 * takes drops.
 */
function SortableIssueCard({ issue }: { issue: Issue }) {
  const canMove = useContext(CanMoveContext);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.key,
    data: { issue, status: issue.status },
    disabled: { draggable: !canMove(issue), droppable: false },
    // The cards already slid into place during the drag, and the drop is animated by dropAnimation; sortable's own
    // slide on the reorder would play on top of both and make the cards jump twice.
    animateLayoutChanges: () => false,
  });
  return (
    <CardLink
      issue={issue}
      dragging={isDragging}
      nodeRef={setNodeRef}
      handles={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    />
  );
}

function useStatusArea(id: string, status: ProjectStatus) {
  return useDroppable({ id, data: { status } });
}

/**
 * Where a carried card will land if dropped now: a card-sized gap at the top of `status` (moves put the Issue first),
 * shown only when the drop would change its Status and, in the Swimlanes, only in the card's own lane (`lane`).
 */
function DropSlot({ status, lane }: { status: ProjectStatus; lane?: string }) {
  const target = useContext(TargetContext);
  if (!target || target.status !== status.id || target.issue.status.id === status.id) return null;
  if (lane !== undefined && lane !== laneIdOf(target.issue)) return null;
  return (
    <div
      className={classes.dropSlot}
      data-drop-slot
      style={{ height: target.height }}
      aria-hidden
    />
  );
}

/**
 * The Board: a column for each Status, in order. Dropping a card on a column moves the Issue to that Status. With
 * `onAdd`, each column ends with "Add issue", which creates an Issue straight in that Status.
 */
export function IssueBoard({
  columns,
  onMove,
  onReorder,
  canMove = () => true,
  onAdd,
}: {
  columns: Column[];
  onMove: MoveIssue;
  onReorder?: ReorderIssue;
  canMove?: CanMove;
  onAdd?: (status: ProjectStatus) => void;
}) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const more = useHiddenSides(scroller);
  useScrollbarWhileScrolling(scroller);
  const height = useHeightToWindowBottom(frame);
  const crowded = useCrowded(scroller, columns.length);

  return (
    <DragBoard
      issues={columns.flatMap((column) => column.items)}
      onMove={onMove}
      onReorder={onReorder}
      canMove={canMove}
    >
      <div ref={setFrame} className={classes.boardFrame} style={{ height }}>
        <div
          ref={setScroller}
          className={classes.board}
          data-more={more}
          data-crowded={crowded || undefined}
        >
          {columns.map((column) => (
            <BoardColumn key={column.status.id} column={column} onAdd={onAdd} />
          ))}
        </div>
        {more && scroller && <Minimap scroller={scroller} columns={columns} />}
      </div>
    </DragBoard>
  );
}

/** The part of the Board in view, as fractions of its whole width. */
type View = { start: number; size: number };

function viewOf(scroller: HTMLElement): View {
  return {
    start: scroller.scrollLeft / scroller.scrollWidth,
    size: scroller.clientWidth / scroller.scrollWidth,
  };
}

/**
 * A small picture of the Board's columns under its right end, shown when they don't all fit, with a frame around the ones in
 * view. Pressing or dragging on it scrolls the Board there. It is for the pointer only: the keyboard reaches every card
 * by Tab, which scrolls it into view anyway.
 */
function Minimap({ scroller, columns }: { scroller: HTMLElement; columns: Column[] }) {
  const [view, setView] = useState<View>(() => viewOf(scroller));

  useLayoutEffect(() => {
    const update = () => setView(viewOf(scroller));
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scroller]);

  /** Centres the view on where the pointer is along the map. */
  function jump(event: PointerEvent<HTMLDivElement>) {
    const map = event.currentTarget.getBoundingClientRect();
    const at = (event.clientX - map.left) / map.width;
    scroller.scrollTo({ left: (at - view.size / 2) * scroller.scrollWidth });
  }

  return (
    <div className={classes.minimap} aria-hidden>
      <div
        className={classes.minimapTrack}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          jump(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) jump(event);
        }}
      >
        {columns.map((column, index) => {
          // In view when most of its share of the width is inside the frame.
          const start = index / columns.length;
          const end = (index + 1) / columns.length;
          const seen =
            Math.min(end, view.start + view.size) - Math.max(start, view.start) > (end - start) / 2;
          return (
            <span
              key={column.status.id}
              className={classes.minimapColumn}
              data-empty={column.total === 0 || undefined}
              data-seen={seen || undefined}
            />
          );
        })}
        <span
          className={classes.minimapView}
          style={{ left: `${view.start * 100}%`, width: `${view.size * 100}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Marks a scroller with `data-scrolling` while it scrolls and for a moment after, so the CSS shows its scrollbar only
 * then. It sets the attribute directly rather than through state, so scrolling doesn't re-render the Board.
 */
function useScrollbarWhileScrolling(element: HTMLElement | null) {
  useEffect(() => {
    if (!element) return;
    const scroller = element;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function scrolled() {
      scroller.dataset.scrolling = "";
      clearTimeout(timer);
      timer = setTimeout(() => delete scroller.dataset.scrolling, 800);
    }
    scroller.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", scrolled);
      clearTimeout(timer);
      delete scroller.dataset.scrolling;
    };
  }, [element]);
}

/** The narrowest a column gets while every column fits; past this they don't all fit and the Board scrolls. */
const NARROWEST_FITTING_COLUMN = 200;

/** Column gap on the Board, as in the CSS (.board). */
const COLUMN_GAP = 12;

/**
 * Whether the columns don't all fit at NARROWEST_FITTING_COLUMN. Then the Board scrolls anyway, so the columns stop
 * squeezing and take a comfortable fixed width instead (the CSS, under data-crowded); otherwise they share the width.
 * Measured from the scroller, so it follows the window and the number of Statuses.
 */
function useCrowded(element: HTMLElement | null, count: number): boolean {
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    if (!element) return;
    const scroller = element;
    const update = () =>
      setCrowded(
        count * NARROWEST_FITTING_COLUMN + (count - 1) * COLUMN_GAP > scroller.clientWidth,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [element, count]);
  return crowded;
}

/** The Board is never shorter than this, so a small window still shows a few cards per column. */
const MIN_BOARD_HEIGHT = 360;

/** The nearest ancestor that scrolls vertically: the Desktop app's content area, or the page itself on the web. */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll|overlay/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

/**
 * The height that takes an element from where it starts down to the bottom of the window, less what sits under it:
 * the padding the shell and the page keep there (the bottom nav bar sits in it), and anything else, measured from the
 * page itself if it still overflows. The Board takes this height, so the page doesn't scroll and its columns scroll on
 * their own instead: their headers and the minimap stay on screen however many cards there are.
 */
function useHeightToWindowBottom(element: HTMLElement | null): number | undefined {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    if (!element) return;
    const self = element;
    const scrollParent = scrollParentOf(self);
    // What lies under the Board besides the ancestors' bottom padding (a margin, a gap, anything after it), measured
    // whenever the page still overflows. The Board's own new height never clears it, so the height settles instead of
    // going back and forth; a resized window or a Board that starts elsewhere (a notice above it came or went, the
    // toolbar wrapped) does, so a passing overflow doesn't keep the Board short for good.
    let missed = 0;
    let lastOffset: number | undefined;
    let lastVisible: number | undefined;
    function update() {
      const top = self.getBoundingClientRect().top;
      const offset = scrollParent
        ? top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop
        : top + window.scrollY;
      const visible = scrollParent ? scrollParent.clientHeight : window.innerHeight;
      if (offset !== lastOffset || visible !== lastVisible) missed = 0;
      lastOffset = offset;
      lastVisible = visible;
      let padding = 0;
      for (let parent = self.parentElement; parent; parent = parent.parentElement) {
        padding += Number.parseFloat(getComputedStyle(parent).paddingBottom) || 0;
        if (parent === scrollParent) break;
      }
      // While the page overflows, its full height says exactly how much is under the Board.
      const content = scrollParent
        ? scrollParent.scrollHeight
        : document.documentElement.scrollHeight;
      if (content > visible + 1) {
        const under = content - (offset + self.offsetHeight);
        missed = Math.max(0, Math.ceil(under - padding));
      }
      setHeight(Math.max(MIN_BOARD_HEIGHT, Math.floor(visible - offset - padding - missed)));
    }
    update();
    window.addEventListener("resize", update);
    // The window's size isn't the only thing that moves the Board: the toolbar above it can wrap, for one. The Board's
    // own frame too, so after each new height it checks once more whether the page still overflows (the page's body
    // may keep one height whatever its content, and wouldn't say).
    const observer = new ResizeObserver(update);
    observer.observe(scrollParent ?? document.body);
    observer.observe(self);
    return () => {
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [element]);
  return height;
}

/**
 * Marks a column's card list with `data-more` ("top", "bottom" or "both") while cards are out of view that way, so the
 * CSS fades that edge instead of cutting a card off, and the fade says there's more. Set on the element directly, not
 * through state, so scrolling a column doesn't re-render the Board; before paint, so the first frame is right.
 */
function useEndFades(element: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!element) return;
    const list = element;
    function update() {
      // A pixel of slack: fractional heights can leave scrollTop just short of the end.
      const top = list.scrollTop > 1;
      const bottom = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
      const more = top && bottom ? "both" : top ? "top" : bottom ? "bottom" : null;
      if (more) list.setAttribute("data-more", more);
      else list.removeAttribute("data-more");
    }
    update();
    list.addEventListener("scroll", update, { passive: true });
    // The list's own size, and its cards': both change as Issues come, go or are edited.
    const observer = new ResizeObserver(update);
    observer.observe(list);
    for (const child of list.children) observer.observe(child);
    const children = new MutationObserver(() => {
      for (const child of list.children) observer.observe(child);
      update();
    });
    children.observe(list, { childList: true });
    return () => {
      list.removeEventListener("scroll", update);
      observer.disconnect();
      children.disconnect();
    };
  }, [element]);
}

type HiddenSides = "left" | "right" | "both" | undefined;

/** Which sides of a horizontal scroller have columns out of view, kept up to date as it scrolls or resizes. */
function useHiddenSides(element: HTMLElement | null): HiddenSides {
  const [sides, setSides] = useState<HiddenSides>(undefined);
  useLayoutEffect(() => {
    if (!element) return;
    const scroller = element;
    function update() {
      // A pixel of slack: fractional widths can leave scrollLeft just short of the end.
      const left = scroller.scrollLeft > 1;
      const right = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      if (left && right) setSides("both");
      else if (left) setSides("left");
      else if (right) setSides("right");
      else setSides(undefined);
    }
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    // Watches the scroller's own size and its columns', which change as cards or Statuses come and go.
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    const children = new MutationObserver(() => {
      for (const child of scroller.children) observer.observe(child);
      update();
    });
    children.observe(scroller, { childList: true });
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
      children.disconnect();
    };
  }, [element]);
  return sides;
}

function BoardColumn({
  column,
  onAdd,
}: {
  column: Column;
  onAdd?: (status: ProjectStatus) => void;
}) {
  const { setNodeRef, isOver } = useStatusArea(column.status.id, column.status);
  const [cards, setCards] = useState<HTMLDivElement | null>(null);
  useEndFades(cards);
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
      {/* The cards scroll on their own; the head above and "Add issue" below stay put. */}
      <div ref={setCards} className={classes.cards}>
        <DropSlot status={column.status} />
        {column.items.length === 0 && column.total === 0 && (
          <div className={classes.emptyColumn}>No issues</div>
        )}
        <SortableContext
          items={column.items.map((issue) => issue.key)}
          strategy={verticalListSortingStrategy}
        >
          {column.items.map((issue) => (
            <SortableIssueCard key={issue.id} issue={issue} />
          ))}
        </SortableContext>
        {column.total > column.items.length && (
          <div className={classes.more}>
            Showing {column.items.length} of {column.total}
          </div>
        )}
      </div>
      {onAdd && (
        <button
          type="button"
          className={classes.add}
          aria-label={`Add issue to ${column.status.name}`}
          onClick={() => onAdd(column.status)}
        >
          <IconPlus size={14} aria-hidden />
          Add issue
        </button>
      )}
    </section>
  );
}

/** One row of the Swimlanes: who it is for, and their Issues. */
type Lane = { id: string; name: string | null; avatarUrl: string | null; issues: Issue[] };

function laneIdOf(issue: Issue) {
  return issue.assignee?.id ?? "none";
}

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
export function IssueSwimlanes({
  columns,
  onMove,
  canMove = () => true,
}: {
  columns: Column[];
  onMove: MoveIssue;
  canMove?: CanMove;
}) {
  const lanes = lanesOf(columns);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  useScrollbarWhileScrolling(scroller);
  return (
    <DragBoard issues={columns.flatMap((column) => column.items)} onMove={onMove} canMove={canMove}>
      <div
        ref={setScroller}
        className={classes.lanes}
        style={{ gridTemplateColumns: `140px repeat(${columns.length}, minmax(200px, 1fr))` }}
      >
        <div className={`${classes.columnHead} ${classes.laneLabel}`}>Assignee</div>
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
      <DropSlot status={status} lane={laneId} />
      {issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
