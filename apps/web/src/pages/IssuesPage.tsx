import { ApiError } from "@repo/api";
import {
  Alert,
  Button,
  Container,
  Group,
  Pagination,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { Loading } from "@repo/ui/skeleton";
import { Tag } from "@repo/ui/tag";
import { IconArrowRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { Issue, IssueSearch } from "../api/client";
import { loadFailure, refreshFailed, useIssues, useProject } from "../api/queries";
import { NewIssueForm } from "../issues/NewIssueForm";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";
import { ProjectListSkeleton } from "./ProjectListSkeleton";
import classes from "./ProjectsPage.module.css";

const PAGE_SIZE = 50;
const ANY = "any";

const CATEGORIES: { value: Issue["status"]["category"]; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];
const TYPES: Issue["type"][] = ["Story", "Bug", "Chore"];
const PRIORITIES: Issue["priority"][] = ["Urgent", "High", "Medium", "Low"];
const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Newest" },
  { value: "priority", label: "Priority" },
];
const WHO = [
  { value: ANY, label: "Everyone" },
  { value: "me", label: "Assigned to me" },
  { value: "none", label: "Unassigned" },
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
  const query = useIssues(key, { ...search, size: PAGE_SIZE });
  const failure = loadFailure(projectQuery) ?? loadFailure(query);
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
  }, [debounced, setParams]);

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
        onRetry={() => void Promise.all([projectQuery.refetch(), query.refetch()])}
      />
    );
  }

  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = Boolean(
    search.category || search.type || search.priority || search.assignee || search.q,
  );

  return (
    <Container size="md" px={0} py="xl">
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
        <Group justify="space-between" align="flex-end">
          <Title order={1} fz={40} lh={1.1}>
            Issues
          </Title>
          {/* An Archived project takes no new Issues. */}
          {project && !project.archived && !creating && (
            <Button onClick={() => setCreating(true)}>Create Issue</Button>
          )}
        </Group>
        {project && creating && (
          <NewIssueForm projectKey={project.key} onCancel={() => setCreating(false)} />
        )}
        <Stack gap="sm">
          <SegmentedControl
            aria-label="Assignee"
            data={WHO}
            value={search.assignee ?? ANY}
            onChange={(value) => change("assignee", value)}
          />
          <Group gap="sm" align="flex-end">
            <TextInput
              label="Title"
              placeholder="Search titles"
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
            />
            <Select
              label="Status category"
              data={[{ value: ANY, label: "Any" }, ...CATEGORIES]}
              value={search.category ?? ANY}
              onChange={(value) => change("category", value)}
              allowDeselect={false}
            />
            <Select
              label="Issue type"
              data={[ANY, ...TYPES].map((value) => ({
                value,
                label: value === ANY ? "Any" : value,
              }))}
              value={search.type ?? ANY}
              onChange={(value) => change("type", value)}
              allowDeselect={false}
            />
            <Select
              label="Priority"
              data={[ANY, ...PRIORITIES].map((value) => ({
                value,
                label: value === ANY ? "Any" : value,
              }))}
              value={search.priority ?? ANY}
              onChange={(value) => change("priority", value)}
              allowDeselect={false}
            />
            <Select
              label="Sort by"
              data={SORTS}
              value={search.sort ?? "updated"}
              onChange={(value) => change("sort", value === "updated" ? null : value)}
              allowDeselect={false}
            />
          </Group>
        </Stack>
        {refreshFailed(query) && (
          <Alert color="yellow" title="Couldn't refresh these Issues">
            Showing the last loaded list.{" "}
            <Button variant="subtle" size="compact-sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </Alert>
        )}
        {data ? (
          <>
            <Text c="dimmed" aria-live="polite">
              {data.total === 1 ? "1 Issue" : `${data.total} Issues`}
            </Text>
            <Panel p={8}>
              {data.items.length === 0 ? (
                <p className={classes.empty}>
                  {data.total > 0
                    ? "This page has no Issues."
                    : filtered
                      ? "No Issues match these filters."
                      : "No Issues yet. Create one to get started."}
                </p>
              ) : (
                <ul className={classes.list} aria-label="Issues">
                  {data.items.map((issue) => (
                    <li key={issue.id}>
                      <Link to={`/issues/${encodeURIComponent(issue.key)}`} className={classes.row}>
                        <div className={classes.project}>
                          <div className={classes.name}>
                            {issue.title}
                            <Tag>{issue.key}</Tag>
                          </div>
                          <div className={classes.summary}>
                            {issue.type} · {issue.priority} · {issue.status.name} ·{" "}
                            {issue.assignee ? issue.assignee.displayName : "Unassigned"}
                          </div>
                        </div>
                        <span className={classes.arrow}>
                          <Glyph icon={IconArrowRight} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {(pages > 1 || (search.page ?? 0) > 0) && (
              <Pagination
                total={Math.max(pages, (search.page ?? 0) + 1)}
                value={(search.page ?? 0) + 1}
                onChange={(value) => change("page", value > 1 ? String(value - 1) : null)}
              />
            )}
          </>
        ) : (
          <Loading>
            <ProjectListSkeleton />
          </Loading>
        )}
      </Stack>
    </Container>
  );
}
