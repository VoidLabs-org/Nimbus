import { useDroppable } from "@dnd-kit/core";
import { createContext, useContext } from "react";
import type { Issue, ProjectStatus } from "../api/client";

/** What the Board, the Swimlanes and the List share while a card or row is carried (see IssueBoard). */

/** Whether the User may move an Issue; a card they can't move is not draggable. Everything is allowed by default. */
export type CanMove = (issue: Issue) => boolean;

export const CanMoveContext = createContext<CanMove>(() => true);

/**
 * The Issue just dropped and the Status it was dropped in (its own, for a drop that moves nothing). While `moving`,
 * its card is hidden wherever it is: in its old column until the Board shows the move (a moment later: TanStack Query
 * tells React on its next tick), and in its new place until the carried card has glided there, which then shows it
 * (see dropAnimation), so there are never two at once. Without animation (`animated` false) only the old place is
 * hidden. A card that `moved` and is in that Status gets its outline traced; if the move fails it is back where it
 * was, untraced.
 */
export type Drop = {
  key: string;
  status: string;
  moved: boolean;
  animated: boolean;
  moving: boolean;
};

export const DropContext = createContext<Drop | null>(null);

/**
 * Where a carried card would land if dropped now: its Issue, the Status under it, the card's height and, on the
 * Board or Swimlanes cell, its place among that column's (or cell's) cards (`index`).
 */
export type Target = { issue: Issue; status: string; height: number | undefined; index?: number };

export const TargetContext = createContext<Target | null>(null);

/** The classes that show a card's part in a drop (see Drop). */
export function useCardDrop(issue: Issue) {
  const drop = useContext(DropContext);
  const dropped = drop?.key === issue.key;
  const there = dropped && issue.status.id === drop.status;
  const landed = there && drop.moved;
  const leaving = dropped && drop.moving && (drop.animated || !there);
  return { landed, leaving };
}

export function useStatusArea(id: string, status: ProjectStatus, lane?: string) {
  return useDroppable({ id, data: { status, lane } });
}

/**
 * The gap `status`'s column (or, with `lane`, that lane's cell) shows, if any: its place among the cards (`at`) and
 * height. Read once per column, so a gap that moves re-renders the columns, not every card. The gap is for a card
 * carried in from another column, and in the Swimlanes only from the same lane.
 */
export function useDropSlot(status: ProjectStatus, lane?: string) {
  const target = useContext(TargetContext);
  if (!target || target.status !== status.id || target.issue.status.id === status.id) return null;
  if (lane !== undefined && lane !== laneIdOf(target.issue)) return null;
  return { at: target.index ?? 0, height: target.height };
}

export function laneIdOf(issue: Issue) {
  return issue.assignee?.id ?? "none";
}

/** dnd-kit's own announcements are off: each view says what happens in its own live region. */
export const SILENT = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};
