import { Stack, Text, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { useIssueHistory } from "../api/queries";
import type { IssueHistoryEntry } from "../api/client";

const FIELD_NAMES: Record<string, string> = {
  title: "the title",
  description: "the description",
  type: "the Issue type",
  priority: "the priority",
  assignee: "the Assignee",
};

/** What happened, in words. Titles, types and priorities show both values; descriptions are too long to. */
function describe(entry: IssueHistoryEntry): string {
  const who = entry.actor?.displayName ?? "Nimbus";
  if (entry.field === "created") return `${who} created this Issue`;
  const what = FIELD_NAMES[entry.field] ?? entry.field;
  if (entry.field === "description") return `${who} changed ${what}`;
  if (entry.field === "assignee") {
    if (!entry.before) return `${who} assigned this Issue to ${entry.after}`;
    if (!entry.after) return `${who} unassigned ${entry.before}`;
    return `${who} changed ${what} from ${entry.before} to ${entry.after}`;
  }
  return `${who} changed ${what} from “${entry.before}” to “${entry.after}”`;
}

/** The Issue's history, newest first. */
export function IssueHistory({ issueKey }: { issueKey: string }) {
  const { data, isError } = useIssueHistory(issueKey);
  return (
    <Panel p="xl">
      <Stack gap="sm">
        <Title order={2} fz={20}>
          History
        </Title>
        {isError && !data && <Text c="dimmed">Couldn't load the history.</Text>}
        {data && (
          <Stack gap="xs" component="ul" m={0} p={0} style={{ listStyle: "none" }}>
            {data.map((entry) => (
              <li key={entry.id}>
                <Text span>{describe(entry)}</Text>{" "}
                <Text span c="dimmed" size="sm" title={new Date(entry.at).toLocaleString()}>
                  {new Date(entry.at).toLocaleString()}
                </Text>
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}
