import { ApiError } from "@repo/api";
import { Alert, Button, Container, Group, Stack, Text, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { Bone, Loading } from "@repo/ui/skeleton";
import { Tag } from "@repo/ui/tag";
import { useParams } from "react-router";
import type { Issue } from "../api/client";
import { loadFailure, refreshFailed, useIssue } from "../api/queries";
import { IssueMarkdown } from "../issues/IssueMarkdown";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";

const CATEGORY_LABELS: Record<Issue["status"]["category"], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

/** Read-only Issue details. Editing, moving, assigning, history and deleting belong to the following tickets. */
export default function IssuePage() {
  const { issueKey = "" } = useParams();
  const query = useIssue(issueKey);
  const issue = query.data;
  const failure = loadFailure(query);

  // An Issue that is unknown and one the User cannot see have exactly the same page.
  if (query.error instanceof ApiError && query.error.status === 404 && !query.isFetching) {
    return (
      <StatusPage
        eyebrow="Error 404"
        title="Issue not found."
        body="Check the Issue link or ask a project Member for help."
        code="404"
        name="Not found"
        actions={<PrimaryAction to="/projects">Go to Projects</PrimaryAction>}
      />
    );
  }
  if (failure) return <FailedLoadPage failure={failure} onRetry={() => void query.refetch()} />;

  const projectKey = issue?.key.slice(0, issue.key.lastIndexOf("-"));

  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail
          crumbs={[
            { label: "Projects", to: "/projects" },
            projectKey
              ? { label: projectKey, to: `/projects/${projectKey}` }
              : { label: "", pending: true },
            issue ? { label: issue.key } : { label: "", pending: true },
          ]}
        />
        {!issue ? (
          <Loading>
            <Stack gap="lg">
              <Bone width="55%" height={44} />
              <Panel p="xl">
                <Stack>
                  <Bone width={80} height={24} />
                  <Bone height={18} />
                  <Bone width="70%" height={18} />
                </Stack>
              </Panel>
            </Stack>
          </Loading>
        ) : (
          <>
            {refreshFailed(query) && (
              <Alert color="yellow" title="Couldn't refresh this Issue">
                Showing the last loaded details.{" "}
                <Button variant="subtle" size="compact-sm" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              </Alert>
            )}
            <Group gap="sm">
              <Tag>{issue.key}</Tag>
              <Tag>{issue.type}</Tag>
            </Group>
            <Title order={1} fz={40} lh={1.1} style={{ overflowWrap: "anywhere" }}>
              {issue.title}
            </Title>
            <Panel p="xl">
              <Stack gap="sm">
                <Title order={2} fz={20}>
                  Description
                </Title>
                {issue.description ? (
                  <IssueMarkdown>{issue.description}</IssueMarkdown>
                ) : (
                  <Text c="dimmed">No description yet.</Text>
                )}
              </Stack>
            </Panel>
            <Panel p="xl">
              <Stack gap="md" component="dl" m={0}>
                <Detail label="Status">
                  {issue.status.name}
                  <Text span c="dimmed">
                    {" "}
                    ({CATEGORY_LABELS[issue.status.category]})
                  </Text>
                </Detail>
                <Detail label="Priority">{issue.priority}</Detail>
                <Detail label="Reporter">
                  <Person person={issue.reporter} />
                </Detail>
                <Detail label="Assignee">
                  {issue.assignee ? (
                    <Person person={issue.assignee} />
                  ) : (
                    <Text span c="dimmed">
                      Unassigned
                    </Text>
                  )}
                </Detail>
              </Stack>
            </Panel>
          </>
        )}
      </Stack>
    </Container>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap="md" wrap="nowrap" align="center">
      <Text component="dt" fw={600} w={110} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text component="dd" m={0}>
        {children}
      </Text>
    </Group>
  );
}

function Person({ person }: { person: NonNullable<Issue["assignee"]> }) {
  return (
    <Group gap="xs" component="span" wrap="nowrap" display="inline-flex">
      <ProfilePicture name={person.displayName} src={person.avatarUrl} size={24} />
      {person.displayName}
    </Group>
  );
}
