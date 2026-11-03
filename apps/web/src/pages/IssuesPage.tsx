import { ApiError } from "@repo/api";
import {
  Alert,
  Button,
  Container,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Panel } from "@repo/ui/panel";
import { Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, type Issue, type IssueSearch, type ProjectStatus } from "../api/client";
import {
  loadFailure,
  refreshFailed,
  useIssueChanged,
  useIssues,
  useProject,
  useProjectStatuses,
  useStatusColumns,
} from "../api/queries";
import { IssueBoard, IssueSwimlanes, type Column } from "../issues/IssueBoard";
import { IssueGroups, IssueTable } from "../issues/IssueTable";
import viewClasses from "../issues/IssueViews.module.css";
import { NewIssueForm } from "../issues/NewIssueForm";
import { useIssuePermissions } from "../issues/useIssuePermissions";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";
import { ProjectListSkeleton } from "./ProjectListSkeleton";
import classes from "./IssuesPage.module.css";

const PAGE_SIZE = 50;
const ANY = "any";

const CATEGORIES: { value: Issue["status"]["category"]; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];
const TYPES: Issue["type"][] = ["Story", "Bug", "Chore"];
const PRIORITIES: Issue["priority"][] = ["Urgent", "High", "Medium", "Low"];
const VIEWS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
  { value: "table", label: "Table" },
  { value: "swimlanes", label: "Swimlanes" },
] as const;
type View = (typeof VIEWS)[number]["value"];

/** The view this browser last used in the project, if it can say. */
function storedView(projectKey: string): View | undefined {
  try {
    const value = localStorage.getItem(`nimbus.issues.view.${projectKey.toUpperCase()}`);
    return VIEWS.find((view) => view.value === value)?.value;
  } catch {
    return undefined;
  }
}

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Newest" },
  { value: "priority", label: "Priority" },
];
/** What the address holds, read as a search; anything not recognised is left out, so a bad link shows everything. */
function searchFrom(params: URLSearchParams): IssueSearch {
  const pick = <T extends string>(name: string, allowed: readonly T[]) => {
    const value = params.get(name);
    return allowed.find((candidate) => candidate === value);
  };
  const page = Number(params.get("page"));
  const assignee = params.get("assignee");
  return {
    category: pick(
      "category",
      CATEGORIES.map((c) => c.value),
    ),
    type: pick("type", TYPES),
    priority: pick("priority", PRIORITIES),
    assignee: assignee === "me" || assignee === "none" ? assignee : undefined,
    q: params.get("q")?.trim() || undefined,
    sort: pick(
      "sort",
      SORTS.map((s) => s.value as "updated" | "created" | "priority"),
    ),
    page: Number.isInteger(page) && page > 0 ? page : undefined,
  };
}

/**
 * A project's Issues, narrowed by the filters in the address (so a filtered list can be shared and survives a
 * reload), each row opening the Issue. The Status filter waits for a way to list the project's Statuses.
 */
export default function IssuesPage() {
  const { key = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const search = searchFrom(params);
  const projectQuery = useProject(key);
  const project = projectQuery.data;
  const permissions = useIssuePermissions(project?.key);
  // The view is in the address (so it can be shared) and remembered per project; the List groups by Status.
  const view: View =
    VIEWS.find((option) => option.value === params.get("view"))?.value ?? storedView(key) ?? "list";
  const grouped = view !== "table";
  const statuses = useProjectStatuses(project?.key);
  const query = useIssues(key, { ...search, size: PAGE_SIZE }, !grouped);
  const columnQueries = useStatusColumns(
    key,
    statuses.data ?? [],
    { ...search, page: undefined },
    grouped,
  );
  const columns: Column[] = (statuses.data ?? []).map((status, index) => ({
    status,
    items: columnQueries[index]?.data?.items ?? [],
    total: columnQueries[index]?.data?.total ?? 0,
  }));
  const issueChanged = useIssueChanged();
  const failure =
    loadFailure(projectQuery) ??
    (grouped
      ? (loadFailure(statuses) ?? columnQueries.map(loadFailure).find((found) => found !== null))
      : loadFailure(query)) ??
    null;
  const [creating, setCreating] = useState(false);
  const urlText = params.get("q") ?? "";
  const [text, setText] = useState(urlText);
  const [seenUrlText, setSeenUrlText] = useState(urlText);
  // A new address (back, a shared link) puts its words in the box; the box's own words coming back change nothing.
  if (seenUrlText !== urlText) {
    setSeenUrlText(urlText);
    if (text.trim() !== urlText.trim()) setText(urlText);
  }
  const [debounced] = useDebouncedValue(text, 300);

  // The words reach the address once typing pauses, starting again from the first page.
  useEffect(() => {
    // Still catching up with the box (or with a clear): nothing to send yet.
    if (debounced !== text) return;
    setParams(
      (current) => {
        if (debounced.trim() === (current.get("q") ?? "").trim()) return current;
        const next = new URLSearchParams(current);
        if (debounced.trim()) next.set("q", debounced.trim());
        else next.delete("q");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [debounced, text, setParams]);

  function chooseView(next: View) {
    try {
      localStorage.setItem(`nimbus.issues.view.${key.toUpperCase()}`, next);
    } catch {
      // Not remembered, but the address still says it.
    }
    const nextParams = new URLSearchParams(params);
    nextParams.set("view", next);
    nextParams.delete("page");
    setParams(nextParams);
  }

  function change(name: string, value: string | null | undefined) {
    const next = new URLSearchParams(params);
    if (value && value !== ANY) next.set(name, value);
    else next.delete(name);
    if (name !== "page") next.delete("page");
    setParams(next);
  }

  if (
    projectQuery.error instanceof ApiError &&
    projectQuery.error.status === 404 &&
    !projectQuery.isFetching
  ) {
    return (
      <StatusPage
        eyebrow="Error 404"
        title="Project not found."
        body="Check the project link or ask a project Member for help."
        code="404"
        name="Not found"
        actions={<PrimaryAction to="/projects">Go to Projects</PrimaryAction>}
      />
    );
  }
  if (failure) {
    return (
      <FailedLoadPage
        failure={failure}
        onRetry={() =>
          void Promise.all([
            projectQuery.refetch(),
            statuses.refetch(),
            query.refetch(),
            ...columnQueries.map((column) => column.refetch()),
          ])
        }
      />
    );
  }

  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const page = search.page ?? 0;
  const filtered = Boolean(
    search.category || search.type || search.priority || search.assignee || search.q,
  );
  const canCreate = project && !project.archived && permissions.canCreate;
  const loaded = grouped
    ? statuses.data !== undefined && columnQueries.every((q) => q.data)
    : Boolean(data);
  const total = grouped
    ? columns.reduce((sum, column) => sum + column.total, 0)
    : (data?.total ?? 0);

  async function move(issueKey: string, status: ProjectStatus) {
    const issue = columns.flatMap((column) => column.items).find((item) => item.key === issueKey);
    if (!issue || issue.status.id === status.id) return;
    try {
      issueChanged(await api.moveIssue(issue.key, status.id));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't move the Issue.");
    }
  }

  const quick = (who: "me" | "none", label: string) => (
    <Button
      variant="default"
      size="compact-md"
      radius="xl"
      className={classes.pill}
      aria-pressed={search.assignee === who}
      onClick={() => change("assignee", search.assignee === who ? null : who)}
    >
      {label}
    </Button>
  );
  const pill = (
    name: string,
    label: string,
    options: { value: string; label: string }[],
    value: string | undefined,
  ) => (
    <Select
      aria-label={label}
      placeholder={label}
      data={options}
      value={value ?? null}
      onChange={(next) => change(name, next)}
      clearable
      radius="xl"
      w={name === "category" ? 130 : 115}
    />
  );
  const same = (list: readonly string[]) => list.map((value) => ({ value, label: value }));
  const createButton = canCreate && (
    <Button radius="xl" onClick={() => setCreating(true)}>
      Create Issue
    </Button>
  );

  return (
    <Container size={view === "board" || view === "swimlanes" ? "xl" : "lg"} px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail
          crumbs={[
            { label: "Projects", to: "/projects" },
            project
              ? { label: project.name, to: `/projects/${encodeURIComponent(project.key)}` }
              : { label: "", pending: true },
            { label: "Issues" },
          ]}
        />
        <div className={classes.header}>
          <Title order={1} fz={40} lh={1.1}>
            Issues
          </Title>
          <Group gap="sm">
            <div className={viewClasses.switch} role="group" aria-label="View">
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={view === option.value}
                  onClick={() => chooseView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {/* An Archived project takes no new Issues. */}
            {createButton}
          </Group>
        </div>
        {project && (
          <NewIssueForm
            opened={creating}
            projectKey={project.key}
            projectName={project.name}
            onClose={() => setCreating(false)}
          />
        )}
        <div className={classes.filters}>
          <TextInput
            aria-label="Title"
            placeholder="Search titles"
            className={classes.search}
            radius="xl"
            leftSection={<IconSearch size={14} />}
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
          />
          {quick("me", "Assigned to me")}
          {quick("none", "Unassigned")}
          {pill("category", "Status", CATEGORIES, search.category)}
          {pill("type", "Type", same(TYPES), search.type)}
          {pill("priority", "Priority", same(PRIORITIES), search.priority)}
          <div className={classes.sort}>Filters apply to every view</div>
        </div>
        {refreshFailed(query) && (
          <Alert color="yellow" title="Couldn't refresh these Issues">
            Showing the last loaded list.{" "}
            <Button variant="subtle" size="compact-sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </Alert>
        )}
        {!loaded ? (
          <Loading>
            <ProjectListSkeleton />
          </Loading>
        ) : total === 0 && !filtered ? (
          <div className={classes.blank}>
            <div className={classes.bar} style={{ width: 160 }} />
            <div className={classes.bar} style={{ width: 120 }} />
            <div className={classes.bar} style={{ width: 70 }} />
            <Title order={2} fz={24} mt="sm">
              No Issues yet
            </Title>
            <Text c="dimmed">
              Create the first one. It'll be {project?.key ?? ""}-1 and start in To do.
            </Text>
            {createButton}
          </div>
        ) : total === 0 && page === 0 ? (
          <p className={classes.empty}>No Issues match these filters.</p>
        ) : view === "board" ? (
          <IssueBoard
            columns={columns}
            onMove={(key, status) => void move(key, status)}
            canMove={permissions.canEdit}
          />
        ) : view === "swimlanes" ? (
          <IssueSwimlanes
            columns={columns}
            onMove={(key, status) => void move(key, status)}
            canMove={permissions.canEdit}
          />
        ) : view === "list" ? (
          <IssueGroups columns={columns} />
        ) : (
          <>
            <Panel p={8}>
              {data && data.items.length > 0 ? (
                <IssueTable
                  issues={data.items}
                  sort={search.sort ?? "updated"}
                  onSort={(sort) => change("sort", sort === "updated" ? null : sort)}
                />
              ) : (
                <p className={classes.empty}>This page has no Issues.</p>
              )}
            </Panel>
            <div className={classes.footer}>
              <span aria-live="polite">
                {!data || data.items.length === 0
                  ? `${total} Issues`
                  : `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + data.items.length} of ${data.total}`}
              </span>
              {(pages > 1 || page > 0) && (
                <Group gap="xs">
                  <Button
                    variant="default"
                    radius="xl"
                    size="compact-md"
                    disabled={page === 0}
                    onClick={() => change("page", page > 1 ? String(page - 1) : null)}
                  >
                    ← Prev
                  </Button>
                  <Button
                    variant="default"
                    radius="xl"
                    size="compact-md"
                    disabled={page + 1 >= pages}
                    onClick={() => change("page", String(page + 1))}
                  >
                    Next →
                  </Button>
                </Group>
              )}
            </div>
          </>
        )}
        {filtered && loaded && (
          <div className={classes.footer}>
            <Button
              variant="transparent"
              size="compact-sm"
              onClick={() => {
                setText("");
                setParams(view === "list" ? new URLSearchParams() : new URLSearchParams({ view }), {
                  replace: true,
                });
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </Stack>
    </Container>
  );
}
