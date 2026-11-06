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

/** How many of the three bars are lit, and their colour. */
const PRIORITY_BARS: Record<Issue["priority"], { lit: number; tone: string }> = {
  Urgent: { lit: 3, tone: classes.urgent },
  High: { lit: 3, tone: classes.high },
  Medium: { lit: 2, tone: classes.high },
  Low: { lit: 1, tone: classes.low },
};

/**
 * The priority as rising signal bars (design "Issues toolbar"): three red for Urgent, three orange for High, two for
 * Medium, one muted for Low. The word is there for screen readers and on hover.
 */
export function PriorityMark({ priority }: { priority: Issue["priority"] }) {
  const { lit, tone } = PRIORITY_BARS[priority];
  return (
    <span className={classes.priorityRow} title={priority}>
      <svg
        className={`${classes.priority} ${tone}`}
        viewBox="0 0 14 12"
        width="14"
        height="12"
        aria-hidden
      >
        {[0, 1, 2].map((bar) => (
          <rect
            key={bar}
            x={bar * 5}
            y={8 - bar * 4}
            width="3"
            height={4 + bar * 4}
            rx="1"
            data-lit={bar < lit || undefined}
          />
        ))}
      </svg>
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
