import { Group, Stack, Text, Title } from "@mantine/core";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { useIssueHistory } from "../api/queries";
import type { IssueHistoryEntry } from "../api/client";
import { timeAgo } from "./timeAgo";

const FIELD_NAMES: Record<string, string> = {
  title: "the title",
  description: "the description",
  type: "the Issue type",
  priority: "the priority",
  assignee: "the Assignee",
  status: "the Status",
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
    <Stack gap="sm">
      <Title order={2} fz={20}>
        History
      </Title>
      {isError && !data && <Text c="dimmed">Couldn't load the history.</Text>}
      {data && (
        <Stack gap="sm" component="ul" m={0} p={0} style={{ listStyle: "none" }}>
          {data.map((entry) => (
            <li key={entry.id}>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ProfilePicture
                  name={entry.actor?.displayName ?? null}
                  src={entry.actor?.avatarUrl}
                  size={24}
                />
                <Text span size="sm" style={{ flex: 1 }}>
                  {describe(entry)}
                </Text>
                <Text span c="dimmed" size="xs" title={new Date(entry.at).toLocaleString()}>
                  {timeAgo(entry.at)} ago
                </Text>
              </Group>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
