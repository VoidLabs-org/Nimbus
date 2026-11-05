import { Stack, Text } from "@mantine/core";
import { ProfilePicture } from "@repo/ui/profile-picture";
import type { ReactNode } from "react";
import { useIssueHistory } from "../api/queries";
import type { Issue, IssueHistoryEntry, ProjectStatus } from "../api/client";
import { NobodyMark, PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import classes from "./IssueHistory.module.css";
import { timeAgo } from "./timeAgo";

/** What happened, in words. Descriptions are too long to show, so they only say they changed. */
function verb(entry: IssueHistoryEntry): string {
  switch (entry.field) {
    case "created":
      return "created this Issue";
    case "status":
      return "moved it";
    case "assignee":
      return "changed the assignee";
    case "description":
      return "edited the description";
    case "title":
      return "changed the title";
    case "type":
      return "changed the type";
    case "priority":
      return "changed the priority";
    default:
      return `changed ${entry.field}`;
  }
}

/** One side of a change: the Status, type, priority, Assignee or title as it was written then. */
function value(
  field: string,
  text: string | null,
  statuses: Pick<ProjectStatus, "name" | "category">[],
): ReactNode {
  if (field === "assignee") {
    return text ? (
      <span className={classes.chip}>
        <ProfilePicture name={text} size={16} />
        {text}
      </span>
    ) : (
      <span className={classes.chip}>
        <NobodyMark />
        Unassigned
      </span>
    );
  }
  if (text === null) return null;
  if (field === "status") {
    // The category is the Status's today; one that was deleted since shows as a plain pill.
    const category = statuses.find((status) => status.name === text)?.category ?? "TODO";
    return <StatusPill status={{ id: text, name: text, category }} />;
  }
  if (field === "type") {
    return (
      <span className={classes.chip}>
        <TypeBadge type={text as Issue["type"]} />
        {text}
      </span>
    );
  }
  if (field === "priority") {
    return (
      <span className={classes.chip}>
        <PriorityMark priority={text as Issue["priority"]} />
        {text}
      </span>
    );
  }
  return null;
}

/** The Issue's history, newest first, with what each change was from and to. */
export function IssueHistory({
  issueKey,
  statuses = [],
}: {
  issueKey: string;
  statuses?: Pick<ProjectStatus, "name" | "category">[];
}) {
  const { data, isError } = useIssueHistory(issueKey);
  return (
    <Stack gap="sm">
      <h2 className={classes.title}>History</h2>
      {isError && !data && <Text c="dimmed">Couldn't load the history.</Text>}
      {data && (
        <ul className={classes.list}>
          {data.map((entry) => (
            <li key={entry.id} className={classes.entry}>
              <ProfilePicture
                name={entry.actor?.displayName ?? null}
                src={entry.actor?.avatarUrl}
                size={28}
              />
              <div className={classes.body}>
                <span>
                  <strong>{entry.actor?.displayName ?? "Nimbus"}</strong> {verb(entry)}
                </span>
                {entry.field === "title" ? (
                  <span className={classes.change}>
                    <s className={classes.was}>{entry.before}</s>
                    <span aria-hidden>→</span>
                    <strong>{entry.after}</strong>
                  </span>
                ) : (
                  (entry.field === "status" ||
                    entry.field === "assignee" ||
                    entry.field === "type" ||
                    entry.field === "priority") && (
                    <span className={classes.change}>
                      {value(entry.field, entry.before, statuses)}
                      <span aria-hidden>→</span>
                      {value(entry.field, entry.after, statuses)}
                    </span>
                  )
                )}
              </div>
              <span className={classes.at} title={new Date(entry.at).toLocaleString()}>
                {timeAgo(entry.at)} ago
              </span>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
