import { VisuallyHidden } from "@mantine/core";
import type { Issue } from "../api/client";
import classes from "./IssueMarks.module.css";

const TYPE_CLASS: Record<Issue["type"], string> = {
  Story: classes.story,
  Bug: classes.bug,
  Chore: classes.chore,
};

/** The Issue's type as a coloured letter, so S, B and C can be told apart at a glance in a list. */
export function TypeBadge({ type }: { type: Issue["type"] }) {
  return (
    <span
      className={`${classes.type} ${TYPE_CLASS[type]}`}
      role="img"
      aria-label={type}
      title={type}
    >
      {type[0]}
    </span>
  );
}

/** The Status as a pill: grey for To do, orange for In progress, white for Done. */
export function StatusPill({ status }: { status: Issue["status"] }) {
  const tone =
    status.category === "IN_PROGRESS"
      ? classes.inProgress
      : status.category === "DONE"
        ? classes.done
        : "";
  return <span className={`${classes.status} ${tone}`}>{status.name}</span>;
}

const PRIORITY_MARK: Record<Issue["priority"], { mark: string; tone: string }> = {
  Urgent: { mark: "▲▲", tone: classes.urgent },
  High: { mark: "▲", tone: "" },
  Medium: { mark: "—", tone: classes.medium },
  Low: { mark: "▼", tone: classes.low },
};

/** The priority as arrows, double and red for Urgent. The word is there for screen readers and on hover. */
export function PriorityMark({ priority }: { priority: Issue["priority"] }) {
  const { mark, tone } = PRIORITY_MARK[priority];
  return (
    <span className={classes.priorityRow} title={priority}>
      <span className={`${classes.priority} ${tone}`} aria-hidden>
        {mark}
      </span>
      <VisuallyHidden>{priority}</VisuallyHidden>
    </span>
  );
}

/** The Status's category as a dot: grey for To do, orange for In progress, white for Done. */
export function StatusDot({ category }: { category: Issue["status"]["category"] }) {
  const tone =
    category === "IN_PROGRESS" ? classes.inProgressDot : category === "DONE" ? classes.doneDot : "";
  return <span className={`${classes.dot} ${tone}`} aria-hidden />;
}

/** An empty ring where an Assignee's picture would be. */
export function NobodyMark() {
  return <span className={classes.nobody} aria-hidden />;
}
