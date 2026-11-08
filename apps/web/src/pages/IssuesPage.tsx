import { ApiError } from "@repo/api";
import { Button, Group, Text, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Panel } from "@repo/ui/panel";
import { Bone, Loading } from "@repo/ui/skeleton";
import { toast } from "@repo/ui/toast";
import { IconZoomCancel } from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import { type Issue, type IssueSearch, type ProjectStatus } from "../api/client";
import {
  columnShown,
  loadFailure,
  refreshFailed,
  useIssueCounts,
  useMoveToEnd,
  useReorderIssue,
  useIssues,
  useProject,
  useProjectStatuses,
  useStatusColumns,
} from "../api/queries";
import { IssueBoard, IssueSwimlanes, type Column } from "../issues/IssueBoard";
import { IssueGroups } from "../issues/IssueList";
import { IssueMenuHost } from "../issues/IssueMenu";
import { IssueTable } from "../issues/IssueTable";
import {
  appliedFields,
  CATEGORIES,
  FIELD_LABELS,
  FILTER_FIELDS,
  PRIORITIES,
  TYPES,
  valueLabel,
  VIEWS,
  type FilterField,
  type View,
} from "../issues/issueFilters";
import { IssueToolbar } from "../issues/IssueToolbar";
import { NewIssueForm } from "../issues/NewIssueForm";
import { useIssuePermissions } from "../issues/useIssuePermissions";
import { useProjectOutlet } from "../projects/projectOutlet";
import { FailedLoadPage } from "../shell/StatusPages";
import classes from "./IssuesPage.module.css";
import { StaleNotice } from "../shell/StaleNotice";

const PAGE_SIZE = 50;

/** The view this browser last used in the project, if it can say. */
function storedView(projectKey: string): View | undefined {
  try {
    const value = localStorage.getItem(`nimbus.issues.view.${projectKey.toUpperCase()}`);
    return VIEWS.find((view) => view.value === value)?.value;
  } catch {
    return undefined;
  }
}

const SORTS = ["updated", "created", "priority"] as const;
/** What the address holds, read as a search; anything not recognised is left out, so a bad link shows everything. */
function searchFrom(params: URLSearchParams): IssueSearch {
  const pick = <T extends string>(name: string, allowed: readonly T[]) => {
    const value = params.get(name);
    return allowed.find((candidate) => candidate === value);
  };
  const page = Number(params.get("page"));
  const assignee = params.get("assignee");
  const status = params.get("status")?.trim();
  return {
    status: status || undefined,
    category: pick(
      "category",
      CATEGORIES.map((c) => c.value),
    ),
    type: pick("type", TYPES),
    priority: pick("priority", PRIORITIES),
    assignee: assignee === "me" || assignee === "none" ? assignee : undefined,
    q: params.get("q")?.trim() || undefined,
    sort: pick("sort", SORTS),
    page: Number.isInteger(page) && page > 0 ? page : undefined,
  };
}

/** The filters, as a sentence: "Status is In progress and Category is To do". */
function describe(search: IssueSearch): string {
  const parts: string[] = appliedFields(search).map(
    (field) => `${FIELD_LABELS[field]} is ${valueLabel(field, search[field] as string)}`,
  );
  if (search.assignee === "me") parts.push("Mine is on");
  if (search.assignee === "none") parts.push("Unassigned is on");
  return parts.join(" and ");
}

/** The search without its paging, sorting and size: what the counts take. */
function countsSearch(search: IssueSearch): IssueSearch {
  const { status, category, type, priority, assignee, q } = search;
  return { status, category, type, priority, assignee, q };
}

/**
 * A project's Issues tab (design "Issues toolbar"), narrowed by the filters in the address (so a filtered view can be
 * shared and survives a reload), in one of four views. A Status filter keeps every Board column but empties the
 * others, so the layout doesn't move; filters or a search that match nothing say so over the empty columns.
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
  // The Table is in Rank order unless the address names another sort.
  const query = useIssues(
    key,
    { ...search, sort: search.sort ?? "rank", size: PAGE_SIZE },
    !grouped,
  );
  const columnQueries = useStatusColumns(
    key,
    statuses.data ?? [],
    { ...search, page: undefined },
    grouped,
  );
  const counts = useIssueCounts(key, countsSearch(search));
  // A column a Status filter hides is empty, whatever its query last held.
  const columns: Column[] = (statuses.data ?? []).map((status, index) => {
    const shown = columnShown(search, status) ? columnQueries[index]?.data : undefined;
    return { status, items: shown?.items ?? [], total: shown?.total ?? 0 };
  });
  const reorderIssue = useReorderIssue();
  const moveToEnd = useMoveToEnd();
  const failure =
    loadFailure(projectQuery) ??
    (grouped
      ? (loadFailure(statuses) ?? columnQueries.map(loadFailure).find((found) => found !== null))
      : loadFailure(query)) ??
    null;
  // A refresh that failed while the last answer is still shown: the open view's own queries (the Board, Swimlanes and
  // List read a query per Status, the Table one paged query), each column only while it is shown.
  const shownColumns = columnQueries.filter((_, index) => {
    const status = statuses.data?.[index];
    return status !== undefined && columnShown(search, status);
  });
  const stale = grouped
    ? refreshFailed(statuses) || shownColumns.some(refreshFailed)
    : refreshFailed(query);
  function retryStale() {
    if (!grouped) return void query.refetch();
    if (refreshFailed(statuses)) void statuses.refetch();
    for (const column of shownColumns) if (refreshFailed(column)) void column.refetch();
  }
  const { createIssue } = useProjectOutlet();
  // The column whose Add issue opened Create Issue, for this project only.
  const [addingTo, setAddingTo] = useState<{ project: string; status: ProjectStatus } | null>(null);
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
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== "page") next.delete("page");
    setParams(next);
  }

  /** Removes `names` from the address, starting again from the first page. */
  function remove(names: readonly string[]) {
    const next = new URLSearchParams(params);
    for (const name of names) next.delete(name);
    next.delete("page");
    setParams(next);
  }

  // An unknown project, or one the User isn't a Member of, is ProjectLayout's Project not found.
  // Before the failure screen's early return: useHeldHeight is a hook, called on every render.
  const loaded = grouped
    ? statuses.data !== undefined &&
      statuses.data.every(
        (status, index) => !columnShown(search, status) || columnQueries[index]?.data,
      )
    : Boolean(query.data);
  const { ref: viewFrame, heldHeight } = useHeldHeight(loaded);
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
  const applied = appliedFields(search).length + (search.assignee ? 1 : 0);
  const filtered = applied > 0;
  const searching = search.q !== undefined;
  // An Archived project takes no new Issues and no moves.
  const archived = project?.archived ?? false;
  const canCreate = project !== undefined && !archived && permissions.canCreate;
  const canMove = (issue: Issue) => !archived && permissions.canEdit(issue);
  const total = grouped
    ? columns.reduce((sum, column) => sum + column.total, 0)
    : (data?.total ?? 0);

  /** A drop on the Board or in a Swimlanes cell: between `after` and `before`, and in `status` when it dropped in another column. */
  async function reorder(
    issueKey: string,
    after: string | undefined,
    before: string | undefined,
    status?: ProjectStatus,
  ) {
    const issue = columns.flatMap((column) => column.items).find((item) => item.key === issueKey);
    if (!issue) return;
    try {
      await reorderIssue(issue, after, before, status);
    } catch (error) {
      const reason =
        error instanceof ApiError || error instanceof Error ? error.message : "Unknown error.";
      toast.error(
        status
          ? `Couldn't move ${issue.key} to ${status.name}: ${reason}`
          : `Couldn't reorder ${issue.key}: ${reason}`,
      );
    }
  }

  /** A row dropped in the Table (in Rank order): between `after` and `before`, of any Status; its Status stays. */
  async function reorderRow(
    issueKey: string,
    after: string | undefined,
    before: string | undefined,
  ): Promise<boolean> {
    const issue = data?.items.find((item) => item.key === issueKey);
    if (!issue) return false;
    try {
      await reorderIssue(issue, after, before, undefined, true);
      return true;
    } catch (error) {
      const reason =
        error instanceof ApiError || error instanceof Error ? error.message : "Unknown error.";
      toast.error(`Couldn't reorder ${issue.key}: ${reason}`);
      // The Table says so in its live region too.
      return false;
    }
  }

  /** Move to top or Move to bottom, from an Issue's menu. */
  async function sendToEnd(issue: Issue, to: "top" | "bottom") {
    try {
      await moveToEnd(issue, to);
    } catch (error) {
      const reason =
        error instanceof ApiError || error instanceof Error ? error.message : "Unknown error.";
      toast.error(`Couldn't move ${issue.key} to the ${to}: ${reason}`);
    }
  }

  /** The menu filters and the quick filters, not the search (state 4's Clear filters). */
  const clearFilters = () => remove([...FILTER_FIELDS, "assignee"]);
  const clearSearch = () => {
    setText("");
    remove(["q"]);
  };
  // The header's Create Issue (ProjectLayout), offered again in an empty project.
  const createButton = canCreate && createIssue && (
    <Button radius="xl" onClick={createIssue}>
      Create Issue
    </Button>
  );
  let nothing: ReactNode = null;
  if (total === 0 && page === 0 && filtered) {
    nothing = (
      <NoMatch
        title="No issues match these filters"
        body={`${describe(search)}. Try removing ${applied > 1 ? "one" : "it"}.`}
        action="Clear filters"
        onAction={clearFilters}
      />
    );
  } else if (total === 0 && page === 0 && searching) {
    nothing = (
      <NoMatch
        title={`No issues match “${search.q}”`}
        body={`Check the spelling or search for a key like ${project?.key ?? "NIM"}-14.`}
        action="Clear search"
        onAction={clearSearch}
      />
    );
  }
  const addTo =
    canCreate && project
      ? (status: ProjectStatus) => setAddingTo({ project: project.key, status })
      : undefined;

  // Under the project's header and tabs (ProjectLayout), which hold the breadcrumb, the title and Create Issue.
  return (
    <>
      <IssueToolbar
        search={search}
        statuses={statuses.data ?? []}
        counts={counts.data}
        text={text}
        onText={(next) => {
          setText(next);
          if (!next) remove(["q"]);
        }}
        view={view}
        onView={chooseView}
        onFilter={(name: FilterField | "assignee", value) => change(name, value)}
        onClearMenu={() => remove(FILTER_FIELDS)}
      />
      {stale && (
        <StaleNotice
          title="Couldn't refresh these Issues"
          shown="the last loaded list"
          onRetry={retryStale}
        />
      )}
      {project && addingTo?.project === project.key && (
        <NewIssueForm
          opened
          projectKey={project.key}
          projectName={project.name}
          status={addingTo.status}
          onClose={() => setAddingTo(null)}
        />
      )}
      {/* Keyed by the view, so switching views fades the new one in instead of swapping it at once. The frame
          keeps the last view's height while the next one loads, so the page doesn't get shorter and scroll up. */}
      <IssueMenuHost has={canMove} onMove={(issue, to) => void sendToEnd(issue, to)}>
        <div ref={viewFrame} style={{ minHeight: loaded ? undefined : heldHeight }}>
          <div key={view} className={classes.viewIn}>
            {!loaded ? (
              <Loading>
                <ViewSkeleton view={view} />
              </Loading>
            ) : total === 0 && page === 0 && !filtered && !searching ? (
              <div className={classes.blank}>
                <div className={classes.bar} style={{ width: 200 }} />
                <div className={classes.bar} style={{ width: 144 }} />
                <div className={classes.bar} style={{ width: 88 }} />
                <Title order={2} fz={24} mt="sm">
                  No Issues yet
                </Title>
                <Text c="dimmed">Create the first one. Statuses are set up with it.</Text>
                {createButton}
              </div>
            ) : view === "board" || view === "swimlanes" ? (
              // The columns stay, with 0 in each, under a message when nothing matches, so the layout doesn't jump.
              <div className={classes.over}>
                {view === "board" ? (
                  <IssueBoard
                    columns={columns}
                    onDrop={(key, after, before, status) =>
                      void reorder(key, after, before, status)
                    }
                    canMove={canMove}
                    onAdd={addTo}
                  />
                ) : (
                  <IssueSwimlanes
                    columns={columns}
                    onDrop={(key, after, before, status) =>
                      void reorder(key, after, before, status)
                    }
                    canMove={canMove}
                  />
                )}
                {nothing}
              </div>
            ) : nothing ? (
              nothing
            ) : view === "list" ? (
              <IssueGroups
                columns={columns.filter((column) => columnShown(search, column.status))}
                onDrop={(key, after, before, status) => void reorder(key, after, before, status)}
                canMove={canMove}
              />
            ) : (
              <>
                <Panel p={8}>
                  {data && data.items.length > 0 ? (
                    <IssueTable
                      issues={data.items}
                      sort={search.sort ?? "rank"}
                      onSort={(sort) => change("sort", sort === "rank" ? null : sort)}
                      // Not while the rows shown are the last answer's (another sort, page or filter), kept until
                      // the new one comes: a drop would send neighbours from a list the server doesn't order that way.
                      onReorder={query.isPlaceholderData ? undefined : reorderRow}
                      canMove={canMove}
                      offset={page * PAGE_SIZE}
                      total={data.total}
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
          </div>
        </div>
      </IssueMenuHost>
    </>
  );
}

/** Nothing matches (states 4 and 4b): what was asked, and the one action that undoes it. */
function NoMatch({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className={classes.noMatch} role="status">
      <span className={classes.noMatchIcon} aria-hidden>
        <IconZoomCancel size={18} />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      <Button variant="default" radius="xl" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

/** The shape of the view on its way, so nothing jumps when the Issues arrive (state 6). */
function ViewSkeleton({ view }: { view: View }) {
  if (view === "board" || view === "swimlanes") {
    return (
      <div className={classes.skeletonBoard}>
        {[3, 2, 2, 1].map((cards, column) => (
          <div key={column} className={classes.skeletonColumn}>
            <Bone width={70} height={22} radius={999} />
            {Array.from({ length: cards }, (_, card) => (
              <div key={card} className={classes.skeletonCard}>
                <Bone width="80%" height={12} />
                <Bone width={60} height={10} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <Panel p={8}>
      {Array.from({ length: 6 }, (_, row) => (
        <div key={row} className={classes.skeletonRow}>
          <Bone width={40} height={12} />
          <Bone width={`${50 - row * 4}%`} height={12} />
        </div>
      ))}
    </Panel>
  );
}

/**
 * The height the view's frame last had with a loaded view in it, to hold while the next one loads: the delayed
 * skeleton (nothing for the first 200ms, then shorter than real content) would otherwise make the page shorter, and the
 * browser would scroll the User up to stay inside it.
 */
function useHeldHeight(loaded: boolean) {
  // State, not a ref: the frame can mount after the view has loaded (after the failure screen), and must be observed.
  const [frame, ref] = useState<HTMLDivElement | null>(null);
  const [heldHeight, setHeldHeight] = useState<number>();
  useEffect(() => {
    if (!frame || !loaded) return;
    const observer = new ResizeObserver(() => setHeldHeight(frame.offsetHeight));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame, loaded]);
  return { ref, heldHeight };
}
