import { ApiError } from "@repo/api";
import {
  ActionIcon,
  Button,
  Container,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconCheck, IconPencil } from "@tabler/icons-react";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { Bone, Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import { useParams } from "react-router";
import { api, type EditIssueInput, type Issue } from "../api/client";
import {
  loadFailure,
  refreshFailed,
  useIssue,
  useIssueChanged,
  useProjectStatuses,
} from "../api/queries";
import { useSession } from "../auth/useSession";
import { DeleteIssueDialog } from "../issues/DeleteIssueDialog";
import { useIssuePermissions } from "../issues/useIssuePermissions";
import { IssueHistory } from "../issues/IssueHistory";
import { NobodyMark, PriorityMark, StatusDot, StatusPill, TypeBadge } from "../issues/IssueMarks";
import { timeAgo } from "../issues/timeAgo";
import { IssueMarkdown } from "../issues/IssueMarkdown";
import { MarkdownField } from "../issues/MarkdownField";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";
import classes from "./IssuePage.module.css";
import { StaleNotice } from "../shell/StaleNotice";

const TYPES = ["Story", "Bug", "Chore"] as const;
const PRIORITIES = ["Urgent", "High", "Medium", "Low"] as const;
const UNASSIGNED = "unassigned";
const CATEGORY_NAMES: Record<Issue["status"]["category"], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

/** A title or description being edited, and the text it was started from. */
type Editing = { field: "title" | "description"; draft: string; original: string };

/** Keyed by the Issue, so a draft, a conflict or an error never carries over to another Issue. */
export default function IssuePage() {
  const { issueKey = "" } = useParams();
  return <IssueDetails key={issueKey} issueKey={issueKey} />;
}

/**
 * Issue details with inline editing: title and description (guarded by the version), and type, priority and Assignee
 * (saved as soon as they are chosen), and the Status, which moves the Issue. Deleting asks first.
 */
function IssueDetails({ issueKey }: { issueKey: string }) {
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
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Someone else changed the text being edited (a refresh saw it), or our save was refused. A change to the other
  // text does not matter: the save then goes with the latest version.
  const stale =
    editing !== null && (conflict || (issue?.[editing.field] ?? "") !== editing.original);

  function startEditing(field: Editing["field"]) {
    if (!issue) return;
    setConflict(false);
    setFieldError(null);
    const original = issue[field] ?? "";
    setEditing({ field, draft: original, original });
  }

  async function saveText() {
    if (!editing || !issue) return;
    setSaving(true);
    setFieldError(null);
    try {
      const updated = await api.editIssue(issue.key, {
        [editing.field]: editing.draft,
        version: issue.version,
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

  const projectKey = issue?.key.slice(0, issue.key.lastIndexOf("-"));
  const statuses = useProjectStatuses(projectKey);
  const permissions = useIssuePermissions(projectKey);
  const canEdit = issue !== undefined && permissions.canEdit(issue);
  const canDelete = issue !== undefined && permissions.canDelete(issue);
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
  const pictureOf = (id: string) =>
    id === user?.id ? user.avatarUrl : id === issue?.assignee?.id ? issue.assignee.avatarUrl : null;
  const statusList = statuses.data ?? (issue ? [{ ...issue.status, position: 0 }] : []);
  const selectClass = `${classes.select} ${canEdit ? "" : classes.readOnly}`;

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

  function loadLatest() {
    setEditing(null);
    setConflict(false);
    void query.refetch();
  }

  return (
    <Container fluid px={0} py="xl">
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
              <Bone height={96} />
            </Stack>
          </Loading>
        ) : (
          <>
            {refreshFailed(query) && (
              <StaleNotice
                title="Couldn't refresh this Issue"
                shown="the last loaded details"
                onRetry={() => void query.refetch()}
              />
            )}
            <DeleteIssueDialog
              issue={issue}
              opened={deleteOpen}
              onClose={() => setDeleteOpen(false)}
            />
            <div className={classes.layout}>
              <div className={classes.main}>
                <Group justify="space-between" wrap="nowrap">
                  <div className={classes.id}>
                    <TypeBadge type={issue.type} />
                    <span>{issue.key}</span>
                  </div>
                  <Button
                    variant="subtle"
                    radius="xl"
                    size="compact-sm"
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(window.location.href)
                        .then(() => toast.success("Link copied."))
                    }
                  >
                    Copy link
                  </Button>
                </Group>
                {editing?.field === "title" ? (
                  <Stack gap="xs">
                    <TextInput
                      aria-label="Title"
                      autoFocus
                      maxLength={255}
                      radius="xl"
                      size="lg"
                      value={editing.draft}
                      error={fieldError}
                      disabled={saving}
                      onChange={(event) =>
                        setEditing({ ...editing, draft: event.currentTarget.value })
                      }
                    />
                    {stale && <StaleAlert onLoad={loadLatest} />}
                    <EditButtons
                      saving={saving}
                      disabled={stale}
                      onSave={() => void saveText()}
                      onCancel={() => setEditing(null)}
                    />
                  </Stack>
                ) : (
                  <div
                    className={canEdit ? classes.editable : undefined}
                    onClick={() => canEdit && editing === null && startEditing("title")}
                  >
                    <Title order={1} fz={36} lh={1.15} style={{ overflowWrap: "anywhere" }}>
                      {issue.title}
                    </Title>
                    {canEdit && (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        radius="xl"
                        className={classes.pencil}
                        aria-label="Edit title"
                        disabled={editing !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditing("title");
                        }}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                    )}
                  </div>
                )}
                <Stack gap="xs">
                  <div className={canEdit ? classes.editable : undefined}>
                    <h2 className={classes.sectionTitle}>Description</h2>
                    {canEdit && editing?.field !== "description" && (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        radius="xl"
                        className={classes.pencil}
                        aria-label="Edit description"
                        disabled={editing !== null}
                        onClick={() => startEditing("description")}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                    )}
                  </div>
                  {editing?.field === "description" ? (
                    <Stack gap="xs">
                      {stale && <StaleAlert onLoad={loadLatest} />}
                      <MarkdownField
                        label="Description"
                        autoFocus
                        maxLength={50000}
                        value={editing.draft}
                        error={fieldError}
                        disabled={saving}
                        onChange={(draft) => setEditing({ ...editing, draft })}
                      />
                      <div className={classes.editFoot}>
                        <span className={classes.hint}>Markdown supported</span>
                        <EditButtons
                          saving={saving}
                          disabled={stale}
                          onSave={() => void saveText()}
                          onCancel={() => setEditing(null)}
                        />
                      </div>
                    </Stack>
                  ) : (
                    <div
                      className={classes.descriptionBox}
                      onClick={() => canEdit && editing === null && startEditing("description")}
                    >
                      {issue.description ? (
                        <IssueMarkdown>{issue.description}</IssueMarkdown>
                      ) : (
                        <Text c="dimmed">No description yet.</Text>
                      )}
                    </div>
                  )}
                </Stack>
                <IssueHistory issueKey={issue.key} statuses={statusList} />
              </div>
              <aside className={classes.side}>
                <dl className={classes.details}>
                  <Detail label="Status">
                    <Select
                      aria-label="Status"
                      className={selectClass}
                      radius="xl"
                      allowDeselect={false}
                      data={statusList.map((status) => ({ value: status.id, label: status.name }))}
                      value={issue.status.id}
                      disabled={quickSaving || !canEdit}
                      leftSection={<StatusDot category={issue.status.category} />}
                      renderOption={({ option, checked }) => {
                        const status = statusList.find((item) => item.id === option.value);
                        return (
                          <span className={classes.option}>
                            {status && <StatusPill status={status} />}
                            <span className={classes.optionNote} aria-hidden>
                              {status && CATEGORY_NAMES[status.category]}
                            </span>
                            {checked && <IconCheck size={14} className={classes.check} />}
                          </span>
                        );
                      }}
                      onChange={(value) =>
                        value && void quickChange(() => api.moveIssue(issue.key, value))
                      }
                    />
                  </Detail>
                  <Detail label="Type">
                    <Select
                      aria-label="Issue type"
                      className={selectClass}
                      radius="xl"
                      allowDeselect={false}
                      data={[...TYPES]}
                      value={issue.type}
                      disabled={quickSaving || !canEdit}
                      leftSection={<TypeBadge type={issue.type} />}
                      renderOption={({ option, checked }) => (
                        <span className={classes.option}>
                          <span aria-hidden>
                            <TypeBadge type={option.value as Issue["type"]} />
                          </span>
                          {option.label}
                          {checked && <IconCheck size={14} className={classes.check} />}
                        </span>
                      )}
                      onChange={(value) =>
                        value && void changeField({ type: value as Issue["type"] })
                      }
                    />
                  </Detail>
                  <Detail label="Priority">
                    <Select
                      aria-label="Priority"
                      className={selectClass}
                      radius="xl"
                      allowDeselect={false}
                      data={[...PRIORITIES]}
                      value={issue.priority}
                      disabled={quickSaving || !canEdit}
                      leftSection={<PriorityMark priority={issue.priority} />}
                      renderOption={({ option, checked }) => (
                        <span className={classes.option}>
                          <span aria-hidden>
                            <PriorityMark priority={option.value as Issue["priority"]} />
                          </span>
                          {option.label}
                          {checked && <IconCheck size={14} className={classes.check} />}
                        </span>
                      )}
                      onChange={(value) =>
                        value && void changeField({ priority: value as Issue["priority"] })
                      }
                    />
                  </Detail>
                  <Detail label="Assignee">
                    <Select
                      aria-label="Assignee"
                      className={selectClass}
                      radius="xl"
                      allowDeselect={false}
                      data={assignees}
                      value={issue.assignee?.id ?? UNASSIGNED}
                      disabled={quickSaving || !canEdit}
                      leftSection={
                        issue.assignee ? (
                          <ProfilePicture
                            name={issue.assignee.displayName}
                            src={issue.assignee.avatarUrl}
                            size={20}
                          />
                        ) : (
                          <NobodyMark />
                        )
                      }
                      renderOption={({ option, checked }) => (
                        <span className={classes.option}>
                          {option.value === UNASSIGNED ? (
                            <NobodyMark />
                          ) : (
                            <ProfilePicture
                              name={option.label}
                              src={pictureOf(option.value)}
                              size={20}
                            />
                          )}
                          {option.label}
                          {option.value === user?.id && (
                            <span className={classes.hint} aria-hidden>
                              (you)
                            </span>
                          )}
                          {checked && <IconCheck size={14} className={classes.check} />}
                        </span>
                      )}
                      onChange={(value) =>
                        value &&
                        void quickChange(() =>
                          api.assignIssue(issue.key, value === UNASSIGNED ? null : value),
                        )
                      }
                    />
                  </Detail>
                  <Detail label="Reporter">
                    <Person person={issue.reporter} />
                  </Detail>
                  <Detail label="Created">
                    <span title={new Date(issue.createdAt).toLocaleString()}>
                      {new Date(issue.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </Detail>
                  <Detail label="Updated">
                    <span title={new Date(issue.updatedAt).toLocaleString()}>
                      {timeAgo(issue.updatedAt)} ago
                    </span>
                  </Detail>
                </dl>
                {canDelete && (
                  <button
                    type="button"
                    className={classes.danger}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete Issue
                  </button>
                )}
                {!canEdit && (
                  <div className={classes.viewOnly}>
                    <span className={classes.viewOnlyPill}>View only</span>
                    <span>You can view this Issue but not change it.</span>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </Stack>
    </Container>
  );
}

/** The way out of a refused or outdated save: the latest version replaces the edit. */
function StaleAlert({ onLoad }: { onLoad: () => void }) {
  return (
    <div className={classes.stale} role="alert">
      <span className={classes.staleMark} aria-hidden>
        !
      </span>
      <span>This Issue changed since you opened it.</span>
      <Button size="compact-sm" radius="xl" variant="default" onClick={onLoad}>
        Load the latest
      </Button>
    </div>
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
      <Button size="compact-md" radius="xl" loading={saving} disabled={disabled} onClick={onSave}>
        Save
      </Button>
      <Button size="compact-md" radius="xl" variant="subtle" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
    </Group>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={classes.row}>
      <dt className={classes.label}>{label}</dt>
      <dd className={classes.value}>{children}</dd>
    </div>
  );
}

function Person({ person }: { person: NonNullable<Issue["assignee"]> }) {
  return (
    <span className={classes.person}>
      <ProfilePicture name={person.displayName} src={person.avatarUrl} size={20} />
      {person.displayName}
    </span>
  );
}
