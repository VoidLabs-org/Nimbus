import { ApiError } from "@repo/api";
import {
  Alert,
  Button,
  Container,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { Bone, Loading } from "@repo/ui/skeleton";
import { Tag } from "@repo/ui/tag";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import { useParams } from "react-router";
import { api, type EditIssueInput, type Issue } from "../api/client";
import { loadFailure, refreshFailed, useIssue, useIssueChanged } from "../api/queries";
import { useSession } from "../auth/useSession";
import { IssueHistory } from "../issues/IssueHistory";
import { IssueMarkdown } from "../issues/IssueMarkdown";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";

const CATEGORY_LABELS: Record<Issue["status"]["category"], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const TYPES = ["Story", "Bug", "Chore"] as const;
const PRIORITIES = ["Urgent", "High", "Medium", "Low"] as const;
const UNASSIGNED = "unassigned";

/** A title or description being edited, and the version it was started from. */
type Editing = { field: "title" | "description"; draft: string; baseVersion: number };

/**
 * Issue details with inline editing: title and description (guarded by the version), and type, priority and Assignee
 * (saved as soon as they are chosen). Moving and deleting belong to the following tickets.
 */
export default function IssuePage() {
  const { issueKey = "" } = useParams();
  const query = useIssue(issueKey);
  const issue = query.data;
  const failure = loadFailure(query);
  const { user } = useSession();
  const issueChanged = useIssueChanged();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Someone else saved a new version while the text was open (a refresh saw it), or our save was refused.
  const stale = editing !== null && (conflict || issue?.version !== editing.baseVersion);

  function startEditing(field: Editing["field"]) {
    if (!issue) return;
    setConflict(false);
    setFieldError(null);
    setEditing({ field, draft: issue[field] ?? "", baseVersion: issue.version });
  }

  async function saveText() {
    if (!editing || !issue) return;
    setSaving(true);
    setFieldError(null);
    try {
      const updated = await api.editIssue(issue.key, {
        [editing.field]: editing.draft,
        version: editing.baseVersion,
      });
      issueChanged(updated);
      setEditing(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === "issue_changed") {
        setConflict(true);
      } else if (error instanceof ApiError && error.fieldErrors[editing.field]) {
        setFieldError(error.fieldErrors[editing.field] ?? null);
      } else {
        toast.error(error instanceof ApiError ? error.message : "Couldn't save your change.");
      }
    } finally {
      setSaving(false);
    }
  }

  // One quick change at a time, so a slower response never overwrites a newer one with an older Issue.
  async function quickChange(change: () => Promise<Issue>) {
    setQuickSaving(true);
    try {
      issueChanged(await change());
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save your change.");
    } finally {
      setQuickSaving(false);
    }
  }

  const changeField = (input: EditIssueInput) =>
    issue && quickChange(() => api.editIssue(issue.key, input));
  // Until the project's Members can be listed, the choices are the User themself and no one.
  const assignees = [
    { value: UNASSIGNED, label: "Unassigned" },
    ...(user ? [{ value: user.id, label: user.displayName }] : []),
    ...(issue?.assignee && issue.assignee.id !== user?.id
      ? [{ value: issue.assignee.id, label: issue.assignee.displayName }]
      : []),
  ];

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
            {stale && (
              <Alert color="yellow" title="This Issue changed since you opened it" role="alert">
                Someone else saved a change to its title or description. Load the latest to see it;
                your unsaved edit will be discarded.{" "}
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={() => {
                    setEditing(null);
                    setConflict(false);
                    void query.refetch();
                  }}
                >
                  Load the latest
                </Button>
              </Alert>
            )}
            {editing?.field === "title" ? (
              <Stack gap="xs">
                <TextInput
                  aria-label="Title"
                  autoFocus
                  maxLength={255}
                  value={editing.draft}
                  error={fieldError}
                  disabled={saving}
                  onChange={(event) => setEditing({ ...editing, draft: event.currentTarget.value })}
                />
                <EditButtons
                  saving={saving}
                  disabled={stale}
                  onSave={() => void saveText()}
                  onCancel={() => setEditing(null)}
                />
              </Stack>
            ) : (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Title order={1} fz={40} lh={1.1} style={{ overflowWrap: "anywhere" }}>
                  {issue.title}
                </Title>
                <Button
                  variant="subtle"
                  size="compact-sm"
                  disabled={editing !== null}
                  onClick={() => startEditing("title")}
                >
                  Edit title
                </Button>
              </Group>
            )}
            <Panel p="xl">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={2} fz={20}>
                    Description
                  </Title>
                  {editing?.field !== "description" && (
                    <Button
                      variant="subtle"
                      size="compact-sm"
                      disabled={editing !== null}
                      onClick={() => startEditing("description")}
                    >
                      Edit description
                    </Button>
                  )}
                </Group>
                {editing?.field === "description" ? (
                  <Stack gap="xs">
                    <Textarea
                      aria-label="Description"
                      autoFocus
                      autosize
                      minRows={6}
                      maxRows={20}
                      maxLength={50000}
                      value={editing.draft}
                      error={fieldError}
                      disabled={saving}
                      onChange={(event) =>
                        setEditing({ ...editing, draft: event.currentTarget.value })
                      }
                    />
                    <EditButtons
                      saving={saving}
                      disabled={stale}
                      onSave={() => void saveText()}
                      onCancel={() => setEditing(null)}
                    />
                  </Stack>
                ) : issue.description ? (
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
                <Detail label="Issue type">
                  <Select
                    aria-label="Issue type"
                    allowDeselect={false}
                    data={[...TYPES]}
                    value={issue.type}
                    disabled={quickSaving}
                    onChange={(value) =>
                      value && void changeField({ type: value as Issue["type"] })
                    }
                  />
                </Detail>
                <Detail label="Priority">
                  <Select
                    aria-label="Priority"
                    allowDeselect={false}
                    data={[...PRIORITIES]}
                    value={issue.priority}
                    disabled={quickSaving}
                    onChange={(value) =>
                      value && void changeField({ priority: value as Issue["priority"] })
                    }
                  />
                </Detail>
                <Detail label="Reporter">
                  <Person person={issue.reporter} />
                </Detail>
                <Detail label="Assignee">
                  <Select
                    aria-label="Assignee"
                    allowDeselect={false}
                    data={assignees}
                    value={issue.assignee?.id ?? UNASSIGNED}
                    disabled={quickSaving}
                    onChange={(value) =>
                      value &&
                      void quickChange(() =>
                        api.assignIssue(issue.key, value === UNASSIGNED ? null : value),
                      )
                    }
                  />
                </Detail>
              </Stack>
            </Panel>
            <IssueHistory issueKey={issue.key} />
          </>
        )}
      </Stack>
    </Container>
  );
}

function EditButtons({
  saving,
  disabled,
  onSave,
  onCancel,
}: {
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Group gap="xs">
      <Button size="compact-md" loading={saving} disabled={disabled} onClick={onSave}>
        Save
      </Button>
      <Button size="compact-md" variant="subtle" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
    </Group>
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
