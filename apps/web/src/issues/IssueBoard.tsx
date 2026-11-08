import {
  closestCenter,
  DndContext,
  DragOverlay,
  getClientRect,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimationFunction,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VisuallyHidden } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { ProfilePicture } from "@repo/ui/profile-picture";
import {
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import type { Issue, ProjectStatus } from "../api/client";
import {
  CanMoveContext,
  SILENT,
  DropContext,
  laneIdOf,
  TargetContext,
  useCardDrop,
  useDropSlot,
  useStatusArea,
  type CanMove,
  type Drop,
  type Target,
} from "./dragContext";
import { PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import {
  aimAt,
  describeEdge,
  describePlace,
  describeWhere,
  neighboursAt,
  nextPlace,
  placeOf,
  type Direction,
  type Group,
  type Place,
} from "./keyboardDrag";
import classes from "./IssueViews.module.css";

/** One Status and the Issues the server sent for it; `total` counts all of them, which may be more than shown. */
export type Column = { status: ProjectStatus; items: Issue[]; total: number };

/**
 * An Issue dropped on the Board or in a Swimlanes cell: the keys of the cards directly above and below where it landed, and `status` when
 * it landed in another column than its own (none of them for a drop in an empty column or cell).
 */
export type DropIssue = (
  issueKey: string,
  after: string | undefined,
  before: string | undefined,
  status?: ProjectStatus,
) => void;

/**
 * On a drop, the carried card glides into the place where the Issue now is (the move is optimistic, so that is its new
 * column) and straightens up as it lands; the card itself stays hidden until it arrives.
 *
 * A move into another column shows a card-sized gap where the card will land (Gap); the drop handler keeps its
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
 * column's (or Swimlanes cell's) nearest card, so a drop there still lands somewhere in it.
 */
const pointerCollisions: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return closestCenter(args);
  const dataOf = (collision: Collision) => collision.data?.droppableContainer.data.current;
  const card = within.find((collision) => dataOf(collision)?.issue);
  if (card) return [card];
  const status = dataOf(within[0]!)?.status as ProjectStatus | undefined;
  if (!status) return within;
  const lane = dataOf(within[0]!)?.lane as string | undefined;
  const nearest = closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => {
      const data = c.data.current;
      return data?.issue && (data.status as ProjectStatus).id === status.id && data.lane === lane;
    }),
  });
  return nearest.length > 0 ? nearest : within;
};

const DIRECTIONS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
} as const satisfies Record<string, Direction>;

/** What screen readers say about moving a card, read with each card. */
const BOARD_INSTRUCTIONS = {
  draggable:
    "To move this Issue, press Space. Up and Down move it one place in its column, Left and Right to the next column. Press Space to drop it, or Escape to put it back.",
};
const LIST_INSTRUCTIONS = {
  draggable:
    "To move this Issue, press Space. Up and Down move it one place, past the end of a Status to the next one. Press Space to drop it, or Escape to put it back.",
};
const SWIMLANES_INSTRUCTIONS = {
  draggable:
    "To move this Issue, press Space. Up and Down move it one place in its cell, Left and Right to the next column of the same Assignee. Press Space to drop it, or Escape to put it back.",
};

/**
 * What differs between the views that share DragBoard: what screen readers are told, whether Up and Down carry a
 * card across the end of its group (the List's groups are stacked, so Left and Right don't apply there either), and
 * what scrolls while a card is near an edge. The List is as long as its page, which then has to scroll too; the Board
 * and Swimlanes only scroll their own scrollers (see autoScroll).
 */
const MODES = {
  board: { instructions: BOARD_INSTRUCTIONS, stacked: false, autoScroll },
  swimlanes: { instructions: SWIMLANES_INSTRUCTIONS, stacked: false, autoScroll },
  list: { instructions: LIST_INSTRUCTIONS, stacked: true, autoScroll: true as const },
} satisfies Record<string, { instructions: object; stacked: boolean; autoScroll: unknown }>;

/** A place for cards (see keyboardDrag) with the Status it stands for and, in the Swimlanes, its lane. */
type StatusGroup = Group & { status: ProjectStatus; lane?: string };

/**
 * The places for cards, with each column's total: the Board's columns, or (with `lanes`) the Swimlanes' cells, a lane
 * after another and a cell for each column in each.
 */
function groupsOf(columns: Column[], lanes?: Lane[]): StatusGroup[] {
  if (!lanes) {
    return columns.map((column) => ({
      id: column.status.id,
      name: column.status.name,
      keys: column.items.map((issue) => issue.key),
      total: column.total,
      status: column.status,
    }));
  }
  return lanes.flatMap((lane) =>
    lane.cells.map((cell) => ({
      id: cell.id,
      name: cell.label,
      keys: cell.issues.map((issue) => issue.key),
      status: cell.status,
      lane: lane.id,
    })),
  );
}

/** The groups of one lane (its cells, one for each column), or all of them without one. */
function inLane(groups: StatusGroup[], lane: string | undefined) {
  return lane === undefined ? groups : groups.filter((group) => group.lane === lane);
}

/** The id of the Swimlanes cell of a lane and a Status; on the Board a place is just its Status's id. */
function cellId(lane: string, status: string) {
  return `${lane}:${status}`;
}

/**
 * A keyboard drag on the Board: the Issue, and the place the arrow keys have carried it to, kept as its Status and
 * index rather than a column's position, so the columns changing meanwhile (a refresh, a Status added) are read
 * afresh at every step and the drop goes to that Status between the cards next to it then.
 */
type KeyboardDrag = {
  issue: Issue;
  /** The id of its place's group (see groupsOf). */
  group: string;
  /** In the Swimlanes, the lane it stays in. */
  lane?: string;
  index: number;
  height: number | undefined;
};

/** The drag's place in `groups`; its own place when its Status is gone, kept within the column's cards. */
function placeIn(groups: Group[], drag: KeyboardDrag): Place | null {
  const group = groups.findIndex((candidate) => candidate.id === drag.group);
  if (group < 0) return placeOf(groups, drag.issue.key);
  const others = groups[group]!.keys.filter((key) => key !== drag.issue.key).length;
  return { group, index: Math.min(drag.index, others) };
}

/**
 * Drag and drop for the Board and the Swimlanes: a mouse, a finger or the keyboard. The drop areas say which Status
 * (and, in the Swimlanes, which lane) they stand for. Every drop says where it landed among the cards of a column (a
 * lane's cell, in the Swimlanes), and the keyboard moves a card by place (Up and Down one place, Left and Right to
 * the next column; see keyboardDrag). The Swimlanes never change the Assignee: a card stays in its lane, and a drop in
 * another lane is put back. A live region says what happens.
 */
export function DragBoard({
  columns,
  lanes,
  mode,
  overlay,
  onDrop,
  canMove,
  children,
}: {
  columns: Column[];
  /** The Swimlanes' lanes; none on the Board. */
  lanes?: Lane[];
  /** The view (see MODES); the Swimlanes when there are `lanes`, the Board otherwise. */
  mode?: keyof typeof MODES;
  /** What the carried Issue looks like; a card by default. */
  overlay?: (issue: Issue) => ReactNode;
  onDrop: DropIssue;
  canMove: CanMove;
  children: ReactNode;
}) {
  const [lifted, setLifted] = useState<Issue | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  // What the live region says: where a carried card is, and where it was dropped.
  const [announcement, setAnnouncement] = useState("");
  // The card a keyboard drop moved, to focus in its new column once it shows there (its old element is gone).
  const refocus = useRef<{ key: string; status: string } | null>(null);
  // The columns as last rendered, for what dnd-kit calls between renders, and this Board's keyboard drag.
  const swimlanes = lanes !== undefined;
  const behaviour = MODES[mode ?? (swimlanes ? "swimlanes" : "board")];
  const latest = useRef<StatusGroup[]>([]);
  const keyboard = useRef<KeyboardDrag | null>(null);
  // Where a pointer drag was last said to be (a Status, and a place on the Board), so each place is said once.
  const said = useRef("");
  // Remade only when the columns change (React Compiler), not on every pointer move.
  const groups = groupsOf(columns, lanes);
  useLayoutEffect(() => {
    latest.current = groups;
  });
  const issues = columns.flatMap((column) => column.items);
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
  useEffect(() => {
    const wanted = refocus.current;
    if (!wanted) return;
    const column = columns.find((candidate) => candidate.status.id === wanted.status);
    if (!column?.items.some((issue) => issue.key === wanted.key)) return;
    refocus.current = null;
    document
      .querySelector<HTMLElement>(`[data-issue="${wanted.key}"]`)
      ?.focus({ preventScroll: true });
  }, [columns]);

  /** Shows a keyboard drag at its place: the gap there, and the live region says where it is. */
  function showPlace(drag: KeyboardDrag, groups: StatusGroup[], place: Place) {
    const status = groups[place.group]!.status.id;
    setTarget({ issue: drag.issue, status, height: drag.height, index: place.index });
    setAnnouncement(describePlace(groups, drag.issue.key, place));
  }

  // Made once, reading the drag and the columns when called, so a drag in progress always sees this Board's latest.
  const [keys] = useState(() => ({
    /** A keyboard drag is over what its place names, whatever the boxes say (two places can share coordinates). */
    collisions: ((args) => {
      const drag = keyboard.current;
      if (drag) {
        const groups = inLane(latest.current, drag.lane);
        const place = placeIn(groups, drag);
        const id = place && aimAt(groups, drag.issue.key, place);
        const container = args.droppableContainers.find((c) => c.id === id);
        if (id && container) return [{ id, data: { droppableContainer: container, value: 0 } }];
      }
      return pointerCollisions(args);
    }) as CollisionDetection,
    /**
     * The arrow keys. On the Board, Up and Down move the card one place in its column and Left and Right to the
     * neighbouring column at the same index (columns line up at the top and cards are alike, so about the same
     * height; Right then Left also comes back to the same place); a key that can't move it further says so. The
     * carried card is moved onto the card it is over at its new place, just below the last one past the end.
     */
    coordinates: ((event, { context }) => {
      const drag = keyboard.current;
      if (!drag) return undefined;
      const direction = DIRECTIONS[event.code as keyof typeof DIRECTIONS] as Direction | undefined;
      const { collisionRect, droppableRects } = context;
      if (!direction || !collisionRect) return undefined;
      event.preventDefault();
      const groups = inLane(latest.current, drag.lane);
      const place = placeIn(groups, drag);
      if (!place) return undefined;
      if (behaviour.stacked && (direction === "left" || direction === "right")) return undefined;
      const next = nextPlace(
        groups,
        drag.issue.key,
        place,
        direction,
        undefined,
        behaviour.stacked,
      );
      if (next.group === place.group && next.index === place.index) {
        setAnnouncement(describeEdge(groups, drag.issue.key, place, direction));
        return undefined;
      }
      const group = groups[next.group]!;
      drag.group = group.id;
      drag.index = next.index;
      showPlace(drag, groups, next);
      const id = aimAt(groups, drag.issue.key, next);
      const rect = droppableRects.get(id);
      if (!rect) return { x: collisionRect.left, y: collisionRect.top };
      // Past the last card of another column (over that card, with nothing below the place): just below it.
      const below =
        !group.keys.includes(drag.issue.key) &&
        id !== group.id &&
        neighboursAt(groups, drag.issue.key, next).before === undefined;
      return {
        x: rect.left + rect.width / 2 - collisionRect.width / 2,
        y: rect.top + rect.height / 2 - collisionRect.height / 2 + (below ? rect.height / 2 : 0),
      };
    }) as KeyboardCoordinateGetter,
  }));

  const sensors = useSensors(
    // A short drag, so a plain click still opens the Issue.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Enter is left to the card's link, which it opens.
    useSensor(KeyboardSensor, {
      coordinateGetter: keys.coordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  /** Where a pointer drag would land on the Board, as a place: the place of the card under it in its own column, the gap's in another. */
  function pointerPlace(
    groups: Group[],
    issue: Issue,
    event: Pick<DragEndEvent, "active" | "over">,
  ) {
    const status = overStatus(issue, event);
    const lane = event.over?.data.current?.lane as string | undefined;
    const id = status && (swimlanes ? cellId(lane ?? laneIdOf(issue), status.id) : status.id);
    const group = id ? groups.findIndex((candidate) => candidate.id === id) : -1;
    if (!status || group < 0) return null;
    if (issue.status.id !== status.id) {
      return { group, index: landingIndex(groups[group]!.keys, event) };
    }
    const overKey = (event.over?.data.current?.issue as Issue | undefined)?.key;
    const index = overKey === undefined ? -1 : groups[group]!.keys.indexOf(overKey);
    return index < 0 ? placeOf(groups, issue.key) : { group, index };
  }

  /**
   * The Status a drop at `event.over` would give `issue`; none when it is over no area, or in the Swimlanes over
   * another lane's, which never changes the Assignee.
   */
  function overStatus(issue: Issue, event: Pick<DragEndEvent, "over">) {
    const area = event.over?.data.current as { status?: ProjectStatus; lane?: string } | undefined;
    if (swimlanes && area?.lane !== undefined && area.lane !== laneIdOf(issue)) return undefined;
    return area?.status;
  }

  /** "at position 2 of 5 in To do" (in the Swimlanes, "in Dana, To do"), or just "in To do" without a place. */
  function at(groups: Group[], key: string, place: Place | null, status: { name: string }) {
    return place ? `at ${describeWhere(groups, key, place)}` : `in ${status.name}`;
  }

  function start(event: DragStartEvent) {
    dropping = false;
    clearRevealed();
    setDrop(null);
    refocus.current = null;
    const issue = issues.find((item) => item.key === event.active.id) ?? null;
    setLifted(issue);
    keyboard.current = null;
    if (!issue) return;
    const place = placeOf(groups, issue.key);
    said.current = `${issue.status.id}:${place ? place.index : ""}`;
    setAnnouncement(`Picked up ${issue.key} ${at(groups, issue.key, place, issue.status)}.`);
    if (!place || !(event.activatorEvent instanceof KeyboardEvent)) return;
    keyboard.current = {
      issue,
      group: groups[place.group]!.id,
      lane: swimlanes ? laneIdOf(issue) : undefined,
      index: place.index,
      height: event.active.rect.current.initial?.height,
    };
  }

  // On every move, since the half of a card the carried one is over decides where it lands; the state only changes
  // when the target does, so the drop areas don't re-render on every pointer move.
  function over(event: DragOverEvent | DragMoveEvent) {
    // A keyboard drag sets its target itself, as its place moves.
    if (keyboard.current) return;
    const issue = event.active.data.current?.issue as Issue | undefined;
    const status = issue && overStatus(issue, event);
    const place = issue ? pointerPlace(groups, issue, event) : null;
    const next: Target | null =
      status && issue
        ? {
            issue,
            status: status.id,
            height: event.active.rect.current.initial?.height,
            index: issue.status.id !== status.id ? place?.index : undefined,
          }
        : null;
    setTarget((now) =>
      now?.issue.key === next?.issue.key &&
      now?.status === next?.status &&
      now?.index === next?.index &&
      now?.height === next?.height
        ? now
        : next,
    );
    const here = status && issue ? `${status.id}:${place?.index ?? ""}` : "";
    if (status && issue && here !== said.current) {
      said.current = here;
      setAnnouncement(
        place ? describePlace(groups, issue.key, place) : `${issue.key}, over ${status.name}`,
      );
    }
  }

  function end(event: DragEndEvent) {
    // Only an animation clears these, and with reduced motion there is none.
    const animated = !prefersReducedMotion();
    dropping = animated;
    const drag = keyboard.current;
    keyboard.current = null;
    const issue = issues.find((item) => item.key === event.active.id);
    let place: Place | null = null;
    let status: ProjectStatus | undefined;
    // A keyboard drag's places are its lane's cells, one for each column.
    const places = drag ? inLane(groups, drag.lane) : groups;
    if (drag) {
      // By keyboard: where its place is now, wherever the boxes put the carried card.
      place = placeIn(places, drag);
      status = place ? places[place.group]?.status : undefined;
    } else if (issue) {
      status = overStatus(issue, event);
      place = pointerPlace(groups, issue, event);
    }
    const from = issue && placeOf(places, issue.key);
    const stayed = from && place && from.group === place.group && from.index === place.index;
    const moved = status !== undefined && issue !== undefined && issue.status.id !== status.id;
    if (issue) {
      setAnnouncement(
        status
          ? `Dropped ${issue.key} ${at(places, issue.key, place, status)}`
          : `${issue.key} was put back ${at(places, issue.key, from ?? null, issue.status)}`,
      );
    }
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
    if (!status || !issue) return;
    if (drag && moved) refocus.current = { key: issue.key, status: status.id };
    if (!place || stayed) return;
    const { after, before } = neighboursAt(places, issue.key, place);
    onDrop(issue.key, after, before, moved ? status : undefined);
  }

  function cancel() {
    dropping = false;
    keyboard.current = null;
    if (lifted) {
      const from = placeOf(groups, lifted.key);
      setAnnouncement(`${lifted.key} was put back ${at(groups, lifted.key, from, lifted.status)}`);
    }
    setLifted(null);
    setTarget(null);
  }

  return (
    <CanMoveContext value={canMove}>
      <DropContext value={drop}>
        <TargetContext value={target}>
          <DndContext
            sensors={sensors}
            accessibility={{
              announcements: SILENT,
              screenReaderInstructions: behaviour.instructions,
            }}
            collisionDetection={keys.collisions}
            autoScroll={behaviour.autoScroll}
            measuring={measuring}
            onDragStart={start}
            onDragOver={over}
            onDragMove={over}
            onDragEnd={end}
            onDragCancel={cancel}
          >
            {children}
            <DragOverlay dropAnimation={prefersReducedMotion() ? null : dropAnimation}>
              {lifted && (overlay ? overlay(lifted) : <CardBody issue={lifted} lifted />)}
            </DragOverlay>
          </DndContext>
          {/* Assertive, so each move is said at once rather than queued behind other speech. */}
          <VisuallyHidden aria-live="assertive" aria-atomic aria-label="Moving cards">
            {announcement}
          </VisuallyHidden>
        </TargetContext>
      </DropContext>
    </CanMoveContext>
  );
}

/**
 * Where a card carried into another column lands, as its index among that column's (or cell's) cards, by key: over a card, above it
 * when the carried card's middle is above that card's middle and below it otherwise (above, when there are no boxes
 * to compare); over the column itself (empty, or no card near), first.
 */
function landingIndex(column: string[], event: Pick<DragEndEvent, "active" | "over">) {
  const overKey = (event.over?.data.current?.issue as Issue | undefined)?.key;
  let index = overKey === undefined ? 0 : column.indexOf(overKey);
  if (index < 0) index = 0;
  else if (overKey !== undefined) {
    const carried = event.active.rect?.current?.translated;
    const card = event.over?.rect;
    if (carried && card && carried.top + carried.height / 2 > card.top + card.height / 2)
      index += 1;
  }
  return index;
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

/**
 * A row of the List: the Status is the group's, so it isn't repeated here (it would also be stale while a carried row
 * glides into another group). The carried one is `lifted`.
 */
export function RowBody({ issue, lifted = false }: { issue: Issue; lifted?: boolean }) {
  return (
    <div className={`${classes.groupRow} ${lifted ? classes.lifted : ""}`}>
      <TypeBadge type={issue.type} />
      <span className={classes.rowKey}>{issue.key}</span>
      <span className={classes.rowTitle}>{issue.title}</span>
      <PriorityMark priority={issue.priority} />
      <AssigneeMark issue={issue} size={24} />
    </div>
  );
}

function CardLink({
  issue,
  dragging,
  handles,
  nodeRef,
  style,
  row = false,
}: {
  issue: Issue;
  dragging: boolean;
  handles: object;
  nodeRef: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  /** A row of the List rather than a card. */
  row?: boolean;
}) {
  const { landed, leaving } = useCardDrop(issue);
  return (
    <Link
      ref={nodeRef}
      to={`/issues/${encodeURIComponent(issue.key)}`}
      className={`${row ? classes.groupRowLink : classes.cardLink} ${dragging ? classes.placeholder : ""} ${landed ? classes.landed : ""} ${leaving ? classes.leaving : ""}`}
      style={style}
      // The browser's own link dragging would fight the drag.
      draggable={false}
      data-issue={issue.key}
      {...handles}
      role="link"
    >
      {row ? <RowBody issue={issue} /> : <CardBody issue={issue} />}
    </Link>
  );
}

/**
 * A card in a Board column or Swimlanes cell, or (`row`) a row of the List: it opens the Issue, is dragged (where it was shows as a dashed outline,
 * and its outline is traced once when it lands in a new Status; see Drop) and is dropped on, so the cards of its
 * column slide apart to open a gap where the carried card would land. A card the User may not move can't be dragged
 * but still takes drops.
 */
export function SortableIssueCard({
  issue,
  swimlanes = false,
  row = false,
}: {
  issue: Issue;
  swimlanes?: boolean;
  row?: boolean;
}) {
  const canMove = useContext(CanMoveContext);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.key,
    data: { issue, status: issue.status, lane: swimlanes ? laneIdOf(issue) : undefined },
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
      // A card the User may not move is a plain link: dnd-kit would mark it aria-disabled, yet it still opens the Issue.
      handles={canMove(issue) ? { ...attributes, ...listeners } : {}}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      row={row}
    />
  );
}

export function Gap({ height }: { height: number | undefined }) {
  return <div className={classes.dropSlot} data-drop-slot style={{ height }} aria-hidden />;
}

/**
 * The Board: a column for each Status, in order. Dropping a card between two cards puts the Issue there, in that
 * column's Status (`onDrop`). With `onAdd`, each column ends with "Add issue", which creates an Issue straight in that
 * Status.
 */
export function IssueBoard({
  columns,
  onDrop,
  canMove = () => true,
  onAdd,
}: {
  columns: Column[];
  onDrop: DropIssue;
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
    <DragBoard columns={columns} onDrop={onDrop} canMove={canMove}>
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

/** In the Swimlanes' minimap, the bar for the Assignee column ahead of the Statuses, in columns (140px of 200px). */
const LABEL_BAR = 0.7;

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
function Minimap({
  scroller,
  columns,
  labelled = false,
}: {
  scroller: HTMLElement;
  columns: Column[];
  /** The Swimlanes: the row also has the Assignee column ahead of the Statuses, drawn as a bar of its own. */
  labelled?: boolean;
}) {
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
        {labelled && <span className={classes.minimapLabel} />}
        {columns.map((column, index) => {
          // In view when most of its share of the width is inside the frame.
          const lead = labelled ? LABEL_BAR : 0;
          const start = (lead + index) / (lead + columns.length);
          const end = (lead + index + 1) / (lead + columns.length);
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
  // The gap for a card carried in from another column opens where it will land, between the cards.
  const slot = useDropSlot(column.status);
  const gap = (at: number) => slot?.at === at && <Gap height={slot.height} />;
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
        {column.items.length === 0 && gap(0)}
        {column.items.length === 0 && column.total === 0 && (
          <div className={classes.emptyColumn}>No issues</div>
        )}
        <SortableContext
          items={column.items.map((issue) => issue.key)}
          strategy={verticalListSortingStrategy}
        >
          {column.items.map((issue, index) => (
            <Fragment key={issue.id}>
              {gap(index)}
              <SortableIssueCard issue={issue} />
            </Fragment>
          ))}
          {column.items.length > 0 && gap(column.items.length)}
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

/** One place for cards in the Swimlanes: a lane's Issues in one Status. */
type Cell = { id: string; label: string; status: ProjectStatus; issues: Issue[] };

/** One row of the Swimlanes: who it is for, their Issues, and those in a cell for each column. */
type Lane = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  issues: Issue[];
  cells: Cell[];
};

/** Lanes by Assignee, in the order they first appear, with Unassigned last. */
function lanesOf(columns: Column[]): Lane[] {
  const lanes = new Map<string, Lane>();
  const unassigned: Lane = { id: "none", name: null, avatarUrl: null, issues: [], cells: [] };
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
      cells: [],
    };
    lane.issues.push(issue);
    lanes.set(issue.assignee.id, lane);
  }
  const all = [...lanes.values(), ...(unassigned.issues.length > 0 ? [unassigned] : [])];
  // The one place the cells are made: what each shows, what a drop sends and what is announced all come from them.
  for (const lane of all) {
    lane.cells = columns.map((column) => ({
      id: cellId(lane.id, column.status.id),
      label: `${lane.name ?? "Unassigned"}, ${column.status.name}`,
      status: column.status,
      issues: lane.issues.filter((issue) => issue.status.id === column.status.id),
    }));
  }
  return all;
}

/**
 * Swimlanes: the Board, grouped by Assignee. A card is dropped between the cards of a cell, in its own column or
 * another of its lane, like on the Board; dropping in another lane's cell is refused, since the Swimlanes never change
 * the Assignee.
 */
export function IssueSwimlanes({
  columns,
  onDrop,
  canMove = () => true,
}: {
  columns: Column[];
  onDrop: DropIssue;
  canMove?: CanMove;
}) {
  const lanes = lanesOf(columns);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const more = useHiddenSides(scroller);
  useScrollbarWhileScrolling(scroller);
  return (
    <DragBoard columns={columns} lanes={lanes} onDrop={onDrop} canMove={canMove}>
      <div className={classes.boardFrame}>
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
            <LaneRow key={lane.id} lane={lane} />
          ))}
        </div>
        {more && scroller && <Minimap scroller={scroller} columns={columns} labelled />}
      </div>
    </DragBoard>
  );
}

function LaneRow({ lane }: { lane: Lane }) {
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
      {lane.cells.map((cell) => (
        <LaneCell key={cell.id} laneId={lane.id} cell={cell} />
      ))}
    </>
  );
}

function LaneCell({ laneId, cell }: { laneId: string; cell: Cell }) {
  const { status, issues, label } = cell;
  const { setNodeRef, isOver, active } = useStatusArea(cell.id, status, laneId);
  // Another lane's cell isn't a place to drop: a drop there is refused, so it isn't lit as one.
  const carried = active?.data.current?.issue as Issue | undefined;
  const over = isOver && (!carried || laneIdOf(carried) === laneId);
  // The gap for a card carried in from another column of the lane opens where it will land, between the cards.
  const slot = useDropSlot(status, laneId);
  const gap = (at: number) => slot?.at === at && <Gap height={slot.height} />;
  return (
    <div
      ref={setNodeRef}
      className={`${classes.cell} ${over ? classes.over : ""}`}
      role="group"
      aria-label={label}
    >
      {issues.length === 0 && gap(0)}
      <SortableContext
        items={issues.map((issue) => issue.key)}
        strategy={verticalListSortingStrategy}
      >
        {issues.map((issue, index) => (
          <Fragment key={issue.id}>
            {gap(index)}
            <SortableIssueCard issue={issue} swimlanes />
          </Fragment>
        ))}
        {issues.length > 0 && gap(issues.length)}
      </SortableContext>
    </div>
  );
}

export type { CanMove };
