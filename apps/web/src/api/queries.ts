import {
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  api,
  type Issue,
  type IssueSearch,
  type Project,
  type ProjectIssueStats,
  type ProjectStatus,
  type Role,
} from "./client";
import { failedLoad, type FailedLoad } from "@repo/api";
import { storedKey } from "../projects/projectKey";

/**
 * Cache keys. A Role's pages share the "roles" prefix (the list, the Role, who holds it), so one invalidation reaches
 * all of them.
 */
export const queryKeys = {
  notifications: ["notifications"] as const,
  notificationList: ["notifications", "list"] as const,
  notificationUnreadCount: ["notifications", "unread-count"] as const,
  notificationSettings: ["notificationSettings"] as const,
  sessions: ["sessions"] as const,
  linkedIdentities: ["linkedIdentities"] as const,
  twoStep: ["twoStep"] as const,
  providers: ["providers"] as const,
  // The list, and one project under it (as the Roles are). Refreshing only the list takes `exact`.
  projects: ["projects"] as const,
  project: (key: string) => ["projects", storedKey(key)] as const,
  // Issue keys match in any case, so the cache holds one entry per Issue, under the uppercase key.
  issue: (key: string) => ["issues", key.toUpperCase()] as const,
  issueHistory: (key: string) => ["issues", key.toUpperCase(), "history"] as const,
  projectStatuses: (projectKey: string) => ["projects", storedKey(projectKey), "statuses"] as const,
  // A project's list under "issues" too, so creating an Issue refreshes it with one invalidation.
  issueList: (projectKey: string, search: IssueSearch) =>
    ["issues", "list", storedKey(projectKey), search] as const,
  // Beside the lists, not under them, so the lists' entries all share one shape; refreshed with them.
  issueCounts: (projectKey: string, search: IssueSearch) =>
    ["issues", "counts", storedKey(projectKey), search] as const,
  projectIssueStats: ["issues", "stats"] as const,
  roles: ["roles"] as const,
  role: (key: string) => ["roles", key] as const,
  holders: (key: string) => ["roles", key, "holders"] as const,
  catalog: ["catalog"] as const,
  audit: ["audit"] as const,
  auditPage: (page: number, asOf?: number) => ["audit", page, asOf] as const,
  permissions: ["permissions"] as const,
  myPermissions: (userId: string) => ["permissions", userId] as const,
  myProjectPermissions: (userId: string, projectId: string) =>
    ["permissions", userId, projectId] as const,
};

/** The projects the signed-in User is a Member of, for the Projects page. */
export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: () => api.projects() });
}

/**
 * One project, for its page. A project the list already holds (the same object, whatever the endpoint) shows at once
 * from it, without a skeleton, and is then refreshed like any cached page (stale time 0). Only used when the project
 * has no entry of its own, so it never replaces newer data.
 */
export function useProject(key: string, enabled = true) {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.project(key),
    queryFn: () => api.project(key),
    enabled,
    initialData: () =>
      client
        .getQueryData<Project[]>(queryKeys.projects)
        ?.find((project) => project.key === storedKey(key)),
    initialDataUpdatedAt: () => client.getQueryState(queryKeys.projects)?.dataUpdatedAt,
  });
}

/**
 * Keep the server's created project, so opening it right after shows it at once, without a skeleton (it is then
 * refreshed, as every cached page is: stale time 0), and refresh the list, which has a new project: as for the Roles,
 * a change invalidates and doesn't patch, and a fetch already under way is replaced, so it can't land without the new
 * project. No other project changes. The list isn't waited for, so opening the project doesn't wait for it.
 */
export function useProjectCreated() {
  const client = useQueryClient();
  return async (project: Project) => {
    await client.cancelQueries({ queryKey: queryKeys.project(project.key), exact: true });
    client.setQueryData(queryKeys.project(project.key), project);
    void client.invalidateQueries({ queryKey: queryKeys.projects, exact: true });
    // The Projects table's Open issues, Progress and Updated wait for the new project's totals.
    void client.invalidateQueries({ queryKey: queryKeys.projectIssueStats });
  };
}

/** One Issue, for its page. */
export function useIssue(key: string) {
  return useQuery({ queryKey: queryKeys.issue(key), queryFn: () => api.issue(key) });
}

/** One Issue's history, newest first. */
export function useIssueHistory(key: string) {
  return useQuery({ queryKey: queryKeys.issueHistory(key), queryFn: () => api.issueHistory(key) });
}

/** A project's Statuses in order, for choosing where to move an Issue. */
export function useProjectStatuses(projectKey: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectStatuses(projectKey ?? ""),
    queryFn: () => api.projectStatuses(storedKey(projectKey ?? "")),
    enabled: projectKey !== undefined,
  });
}

/**
 * A Status was added, renamed, moved or deleted: refresh the project's Statuses and every Issue (a delete moves
 * Issues and a rename changes the name shown on them).
 */
export function useStatusesChanged() {
  const client = useQueryClient();
  return (projectKey: string) => {
    void client.invalidateQueries({ queryKey: queryKeys.projectStatuses(projectKey) });
    void client.invalidateQueries({ queryKey: ["issues"] });
  };
}

/** One page of a project's Issues. The previous page stays on screen while the next filter or page loads. */
export function useIssues(projectKey: string, search: IssueSearch, enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.issueList(projectKey, search),
    queryFn: () => api.issues(storedKey(projectKey), search),
    // Only another filter or page of the same project; another project's list is never shown in its place.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === storedKey(projectKey) ? previous : undefined,
  });
}

/**
 * The Issue totals of all the User's projects, for the Projects table's Open issues, Progress and Updated: one request
 * however many projects there are. Under "issues", so creating, moving or deleting an Issue refreshes it with the rest.
 *
 * A Board move counts in these totals at once (countStatusChange). Coming back to Projects before the server has
 * answered it, a fetch then would bring the totals from before the move and show them for a moment, so it waits
 * until the Board changes on their way have finished (the page shows the counted totals meanwhile).
 */
export function useProjectIssueStats() {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.projectIssueStats,
    queryFn: async ({ signal }) => {
      await boardChangesFinished(client);
      // Cancelled meanwhile: the refresh the last change started asks instead.
      signal.throwIfAborted();
      return api.projectIssueStats();
    },
  });
}

/**
 * How many of the project's Issues match `search`, in total and per value of each field, for the Filter menu, the
 * count on the toolbar and the Issues tab. The last answer stays while the next search loads.
 */
export function useIssueCounts(projectKey: string, search: IssueSearch, enabled = true) {
  return useQuery({
    enabled: enabled && projectKey !== "",
    queryKey: queryKeys.issueCounts(projectKey, search),
    queryFn: () => api.issueCounts(storedKey(projectKey), search),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === storedKey(projectKey) ? previous : undefined,
  });
}

/** The most Issues the server sends for one Status; the Board, Swimlanes and grouped List show this many a column. */
export const COLUMN_SIZE = 100;

/**
 * The project's Issues one Status at a time, in the Statuses' order, for the Board, Swimlanes and the grouped List.
 * Each column is its own list under "issues", so any change to an Issue refreshes them all with the lists. Columns are
 * always in Rank order, whatever `search.sort` says: only the Table sorts.
 */
export function useStatusColumns(
  projectKey: string,
  statuses: ProjectStatus[],
  search: IssueSearch,
  enabled = true,
) {
  return useQueries({
    queries: statuses.map((status) => {
      const columnSearch: IssueSearch = {
        ...search,
        status: status.name,
        sort: "rank",
        size: COLUMN_SIZE,
      };
      return {
        queryKey: queryKeys.issueList(projectKey, columnSearch),
        queryFn: () => api.issues(storedKey(projectKey), columnSearch),
        // A Status filter keeps every column but asks only for its own: the others are empty without asking, and
        // keep no earlier answer as a placeholder (a disabled query still shows one).
        enabled: enabled && columnShown(search, status),
        placeholderData: columnShown(search, status) ? keepPreviousData : undefined,
      };
    }),
  });
}

/** Whether a Status's column has Issues to ask for under `search`: all do, unless a Status filter names another. */
export function columnShown(search: IssueSearch, status: ProjectStatus) {
  return search.status === undefined || search.status.toLowerCase() === status.name.toLowerCase();
}

/** The project key of an Issue key (the Issue key is the project key, a dash and a number). */
export function projectKeyOf(issueKey: string) {
  return issueKey.slice(0, issueKey.lastIndexOf("-"));
}

/** The key prefix of all of an Issue's project's lists. */
function projectIssueLists(issueKey: string) {
  return ["issues", "list", projectKeyOf(issueKey)] as const;
}

/** The key prefix of all of an Issue's project's counts, which change whenever its lists do. */
function projectIssueCounts(issueKey: string) {
  return ["issues", "counts", projectKeyOf(issueKey)] as const;
}

/** Refresh what changes with any of a project's Issues: its lists, its counts, and the Projects table's totals. */
function refreshProjectIssues(client: QueryClient, issueKey: string) {
  void client.invalidateQueries({ queryKey: projectIssueLists(issueKey) });
  void client.invalidateQueries({ queryKey: projectIssueCounts(issueKey) });
  void client.invalidateQueries({ queryKey: queryKeys.projectIssueStats });
}

/**
 * Count a Status change in the Projects table's totals at once (Progress counts Done Issues, and Updated), so going
 * back to Projects shows it straight away instead of the cached totals until the refresh comes back. The refresh that
 * follows every change puts the server's numbers in.
 */
function countStatusChange(
  client: QueryClient,
  issueKey: string,
  from: Issue["status"]["category"],
  to: Issue["status"]["category"],
) {
  if (from === to) return;
  const project = projectKeyOf(issueKey).toLowerCase();
  const done = (to === "DONE" ? 1 : 0) - (from === "DONE" ? 1 : 0);
  client.setQueryData<ProjectIssueStats[]>(queryKeys.projectIssueStats, (stats) =>
    stats?.map((row) =>
      row.projectKey.toLowerCase() === project
        ? { ...row, done: row.done + done, updatedAt: new Date().toISOString() }
        : row,
    ),
  );
}

/** Keep the server's created Issue, so opening it right after shows it at once (it is then refreshed). */
export function useIssueCreated() {
  const client = useQueryClient();
  return (issue: Issue) => {
    client.setQueryData(queryKeys.issue(issue.key), issue);
    // The project's lists and counts have a new Issue.
    refreshProjectIssues(client, issue.key);
  };
}

/** Drop the deleted Issue's own queries (so nothing refetches a 404) and refresh the project's lists. */
export function useIssueDeleted() {
  const client = useQueryClient();
  return (issueKey: string) => {
    client.removeQueries({ queryKey: queryKeys.issue(issueKey) });
    refreshProjectIssues(client, issueKey);
  };
}

/** Keep the server's edited Issue, and refresh its history and its project's lists. */
export function useIssueChanged() {
  const client = useQueryClient();
  return (issue: Issue) => {
    const before = client.getQueryData<Issue>(queryKeys.issue(issue.key));
    if (before) countStatusChange(client, issue.key, before.status.category, issue.status.category);
    client.setQueryData(queryKeys.issue(issue.key), issue);
    void client.invalidateQueries({ queryKey: queryKeys.issueHistory(issue.key) });
    refreshProjectIssues(client, issue.key);
  };
}

/**
 * Board moves sent and not yet answered, per cache, and the Issues whose projects they changed: when the last one
 * finishes, whether it worked or not, every project a finished move changed is refreshed.
 */
const movesInFlight = new WeakMap<
  QueryClient,
  {
    count: number;
    changed: Set<string>;
    reordered: Map<string, string>;
    /** Called when the last change on its way has finished. */
    waiting: (() => void)[];
  }
>();

/** Resolves once no Board change is on its way (at once when none is). */
function boardChangesFinished(client: QueryClient): Promise<void> {
  const moves = movesInFlight.get(client);
  if (!moves || moves.count === 0) return Promise.resolve();
  return new Promise((resolve) => moves.waiting.push(resolve));
}

/**
 * Move an Issue to a Status with the Board updated at once: the card is taken out of its column and put at the top
 * of the new one before the server answers, and put back if the move fails.
 *
 * Two things keep a moved card from flashing back to its old column. The Board changes in the same moment as the
 * drop: a refresh already on its way is cancelled without awaiting it, and without putting back the data it started
 * from (its default), which would undo the move. And while other moves are still on their way, a finished move doesn't
 * refresh the lists: a refresh then could come back before the server has the later moves and show their cards where
 * they were. The last move to finish refreshes the lists of every project a move changed (moves on several projects'
 * Boards share the count), when the server has every move, also when that last move failed.
 */
export function useMoveIssue() {
  const client = useQueryClient();
  return async (issue: Issue, status: ProjectStatus) => {
    const lists = { queryKey: projectIssueLists(issue.key) };
    // Silently: a refresh cut short is not a failed refresh, which would show "Couldn't refresh these Issues".
    void client.cancelQueries(lists, { revert: false, silent: true });
    const snapshot = client.getQueriesData<{ items: Issue[]; total: number }>(lists);
    const moved = { ...issue, status };
    for (const [key, data] of snapshot) {
      if (!data) continue;
      const search = key[key.length - 1] as IssueSearch | undefined;
      const here = data.items.some((item) => item.key === issue.key);
      // Status filters match names ignoring case, as the server does.
      const filtered = search?.status?.toLowerCase();
      if (filtered === status.name.toLowerCase() && !here) {
        client.setQueryData(key, { ...data, items: [moved, ...data.items], total: data.total + 1 });
      } else if (filtered === issue.status.name.toLowerCase() && here) {
        client.setQueryData(key, {
          ...data,
          items: data.items.filter((item) => item.key !== issue.key),
          total: data.total - 1,
        });
      }
    }
    countStatusChange(client, issue.key, issue.status.category, status.category);
    const settle = startBoardChange(client);
    try {
      const saved = await inOrder(client, issue.key, () => api.moveIssue(issue.key, status.id));
      client.setQueryData(queryKeys.issue(saved.key), saved);
      void client.invalidateQueries({ queryKey: queryKeys.issueHistory(saved.key) });
      settle.done(saved.key);
    } catch (error) {
      // The totals were counted at the drop: ask the server for them again.
      void client.invalidateQueries({ queryKey: queryKeys.projectIssueStats });
      settle.failed(issue.key, snapshot);
      throw error;
    }
  };
}

/**
 * Board changes go to the server one at a time per project, in the order they were made: a drop's neighbours are the cards the
 * Board showed, which already include the drops before it, so a later one must not be applied first. (Sent together
 * over separate connections, they could arrive either way round.) An earlier one failing doesn't hold the rest back.
 */
const sending = new WeakMap<QueryClient, Map<string, Promise<unknown>>>();

function inOrder<T>(client: QueryClient, issueKey: string, send: () => Promise<T>): Promise<T> {
  // Per project: changes to different projects' Issues have nothing to do with each other.
  const queues = sending.get(client) ?? new Map<string, Promise<unknown>>();
  sending.set(client, queues);
  const project = projectKeyOf(issueKey);
  const turn = (queues.get(project) ?? Promise.resolve()).then(send);
  queues.set(
    project,
    turn.catch(() => {}),
  );
  return turn;
}

/**
 * A Board change (a move or a reorder) is on its way. `done` and `failed` end it; the last one to end, whether it
 * worked or not, refreshes every project a finished change touched.
 */
function startBoardChange(client: QueryClient) {
  const moves = movesInFlight.get(client) ?? {
    count: 0,
    changed: new Set<string>(),
    reordered: new Map<string, string>(),
    waiting: [],
  };
  movesInFlight.set(client, moves);
  moves.count += 1;
  /**
   * One change fewer on its way; the last one refreshes every project a finished change changed. A reorder only
   * changes the order of its own column (no counts, totals or other columns), so that is all it refreshes.
   */
  const settle = () => {
    moves.count -= 1;
    if (moves.count > 0) return;
    const refreshed = new Set<string>();
    for (const issueKey of moves.changed) {
      refreshed.add(projectKeyOf(issueKey));
      refreshProjectIssues(client, issueKey);
    }
    for (const [issueKey, statusName] of moves.reordered) {
      if (refreshed.has(projectKeyOf(issueKey))) continue;
      void client.invalidateQueries({
        queryKey: projectIssueLists(issueKey),
        predicate: (query) => {
          // Every list in Rank order that can show the Issue: its Status's column, and the lists of all Statuses
          // (the Table sorted by Rank), which the optimistic reorder changed too.
          const search = query.queryKey[query.queryKey.length - 1] as IssueSearch | undefined;
          if (search?.sort !== "rank") return false;
          return (
            search.status === undefined || search.status.toLowerCase() === statusName.toLowerCase()
          );
        },
      });
    }
    moves.changed.clear();
    moves.reordered.clear();
    // After the refresh above, which cancels a totals fetch that was waiting, so that one never asks the server.
    for (const resolve of moves.waiting.splice(0)) resolve();
  };
  return {
    /** A move changed the Issue's project; a reorder (`reorderedIn`: its Status's name) only that column. */
    done(issueKey: string, reorderedIn?: string) {
      if (reorderedIn) moves.reordered.set(issueKey, reorderedIn);
      else moves.changed.add(issueKey);
      settle();
    },
    /** Alone, put the Board back as it was; with others on their way the snapshot would undo theirs too, so ask the server. */
    failed(issueKey: string, snapshot: [QueryKey, unknown][], reorderedIn?: string) {
      if (moves.count === 1) for (const [key, data] of snapshot) client.setQueryData(key, data);
      else if (reorderedIn) moves.reordered.set(issueKey, reorderedIn);
      else moves.changed.add(issueKey);
      settle();
    },
  };
}

/**
 * The items with the Issue put directly after `after`, else directly before `before`; unchanged when neither is shown.
 * `issue` is the key of one of the items (a reorder), or an Issue to add (a drop from another column), which goes
 * first when no neighbour was named at all (an empty column).
 */
export function placeIssue<T extends { key: string }>(
  items: T[],
  issue: T | string,
  after: string | undefined,
  before: string | undefined,
): T[] {
  const adding = typeof issue !== "string";
  const key = adding ? issue.key : issue;
  const placed = adding ? issue : items.find((item) => item.key === key);
  const rest = items.filter((item) => item.key !== key);
  const afterAt = after === undefined ? -1 : rest.findIndex((item) => item.key === after);
  const beforeAt = before === undefined ? -1 : rest.findIndex((item) => item.key === before);
  let anchor = afterAt >= 0 ? afterAt + 1 : beforeAt;
  if (anchor < 0 && adding && after === undefined && before === undefined) anchor = 0;
  if (!placed || anchor < 0) return items;
  return [...rest.slice(0, anchor), placed, ...rest.slice(anchor)];
}

/**
 * Reorder an Issue with the Board updated at once: the card goes between the cards it was dropped between before the
 * server answers, and goes back if that fails. With a `status` other than its own (a drop in another column) the
 * same request moves it there too: the card leaves its column and lands between those cards in the new one. Shares
 * {@link useMoveIssue}'s bookkeeping: the last of several quick drops, moves and reorders, once answered, refreshes
 * the lists (only the column, for a drop that kept the Status).
 */
export function useReorderIssue() {
  const client = useQueryClient();
  return async (
    issue: Issue,
    after: string | undefined,
    before: string | undefined,
    status?: ProjectStatus,
  ) => {
    const moving = status !== undefined && status.id !== issue.status.id;
    const lists = { queryKey: projectIssueLists(issue.key) };
    // Silently: a refresh cut short is not a failed refresh, which would show "Couldn't refresh these Issues".
    void client.cancelQueries(lists, { revert: false, silent: true });
    const snapshot = client.getQueriesData<{ items: Issue[]; total: number }>(lists);
    const moved = moving ? { ...issue, status } : issue;
    for (const [key, data] of snapshot) {
      if (!data) continue;
      const search = key[key.length - 1] as IssueSearch | undefined;
      // Status filters match names ignoring case, as the server does.
      const filtered = search?.status?.toLowerCase();
      const here = data.items.some((item) => item.key === issue.key);
      if (moving && filtered === issue.status.name.toLowerCase()) {
        // The column it left.
        if (here) {
          client.setQueryData(key, {
            ...data,
            items: data.items.filter((item) => item.key !== issue.key),
            total: data.total - 1,
          });
        }
      } else if (moving && filtered === status.name.toLowerCase()) {
        if (here) continue;
        // The column it was dropped in: between the cards it landed between, or first in an empty one. A list of
        // that Status that doesn't show them (another filter) gets it from the refresh; one in another sort (the
        // Table) shows it first until then.
        const items =
          search?.sort === "rank"
            ? placeIssue(data.items, moved, after, before)
            : [moved, ...data.items];
        if (items !== data.items) {
          client.setQueryData(key, { ...data, items, total: data.total + 1 });
        }
      } else if (search?.sort === "rank" && (!moving || filtered === undefined)) {
        // Its own column, for a reorder, and lists of every Status in Rank order (the Table sorted by Rank); other
        // columns don't have it, and the Table's other sorts show no new place.
        const items = moving
          ? placeIssue(
              data.items.map((item) => (item.key === issue.key ? moved : item)),
              issue.key,
              after,
              before,
            )
          : placeIssue(data.items, issue.key, after, before);
        if (items !== data.items) client.setQueryData(key, { ...data, items });
      }
    }
    if (moving) countStatusChange(client, issue.key, issue.status.category, status.category);
    const settle = startBoardChange(client);
    try {
      const saved = await inOrder(client, issue.key, () =>
        api.reorderIssue(issue.key, after, before, moving ? status.id : undefined),
      );
      client.setQueryData(queryKeys.issue(saved.key), saved);
      if (moving) {
        void client.invalidateQueries({ queryKey: queryKeys.issueHistory(saved.key) });
        settle.done(saved.key);
      } else settle.done(saved.key, issue.status.name);
    } catch (error) {
      // The totals were counted at the drop: ask the server for them again.
      if (moving) void client.invalidateQueries({ queryKey: queryKeys.projectIssueStats });
      settle.failed(issue.key, snapshot, moving ? undefined : issue.status.name);
      throw error;
    }
  };
}

/** A refresh failed while older data is still on screen: say so, since the data may be out of date. */
export function refreshFailed(query: UseQueryResult): boolean {
  return query.isRefetchError && !query.isFetching;
}

/**
 * Why a load failed, for the status page that replaces the content, or null. Only while there is nothing to show
 * (a failed refresh keeps the cached content) and not while trying again.
 */
export function loadFailure(query: UseQueryResult): FailedLoad | null {
  return query.isError && !query.isFetching && query.data === undefined
    ? failedLoad(query.error)
    : null;
}

/** The signed-in User's email switches per Issue Notification type, for Settings › Notifications. */
export function useNotificationSettings() {
  return useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => api.notificationSettings(),
  });
}

/** The signed-in User's running sign-ins, for the Security page. */
export function useSessions() {
  return useQuery({ queryKey: queryKeys.sessions, queryFn: () => api.sessions() });
}

/** The Google and GitHub accounts connected to the signed-in User, for the Security page. */
export function useLinkedIdentities() {
  return useQuery({ queryKey: queryKeys.linkedIdentities, queryFn: () => api.linkedIdentities() });
}

/** Whether the User has Two-step verification, for its card on the Security page. */
export function useTwoStep() {
  return useQuery({ queryKey: queryKeys.twoStep, queryFn: () => api.twoStep() });
}

/** The ids of the sign-in providers the server has switched on, for the Security page. */
export function useProviders() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: () => api.providers() });
}

/** Every Role, for the Roles list. */
export function useRoles() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: () => api.roles() });
}

/** One Role with its Grants. */
export function useRole(key: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.role(key), queryFn: () => api.role(key), enabled });
}

/** Every Permission a Role can hold, grouped for the Role page. */
export function usePermissionCatalog() {
  return useQuery({ queryKey: queryKeys.catalog, queryFn: () => api.permissionCatalog() });
}

/** Who holds a platform role. */
export function useRoleHolders(key: string) {
  return useQuery({ queryKey: queryKeys.holders(key), queryFn: () => api.roleHolders(key) });
}

/**
 * One page of the audit log. While the next page loads, the previous one stays as `data` (check `isPlaceholderData`),
 * so the list doesn't collapse and the Pagination doesn't vanish. `asOf` pins the set of entries the pages are cut from.
 */
export function useAuditLog(page: number, pageSize: number, asOf?: number) {
  return useQuery({
    queryKey: queryKeys.auditPage(page, asOf),
    queryFn: () => api.auditLog(page, pageSize, asOf),
    placeholderData: keepPreviousData,
  });
}

/**
 * Call after anything that changes a Role (create, rename, save, reset, delete, give or take): refreshes every page
 * that shows Roles or their holders, the audit log (which gains an entry) and the User's own permissions (the Role may
 * be theirs). Pages mounted now refetch at once; the rest refetch when next opened. Pass the Role as the server
 * returned it, when there is one, and it replaces the cached Role instead of being fetched again.
 */
export function useRolesChanged() {
  const client = useQueryClient();
  return async (updated?: Role) => {
    if (updated) {
      // A refetch of this Role already under way would come back with the version before this change and undo it.
      await client.cancelQueries({ queryKey: queryKeys.role(updated.key), exact: true });
      client.setQueryData(queryKeys.role(updated.key), updated);
    }
    await Promise.all([
      client.invalidateQueries({
        queryKey: queryKeys.roles,
        // This Role was just replaced, and renaming, saving or resetting doesn't change who holds it: leave its own
        // entries (the Role and its holders) alone and refresh the rest.
        predicate: ({ queryKey }) => !updated || queryKey[1] !== updated.key,
      }),
      client.invalidateQueries({ queryKey: queryKeys.audit }),
      client.invalidateQueries({ queryKey: queryKeys.permissions }),
    ]);
  };
}

/** Call after a Role is deleted: forgets it and its holders (nothing should fetch them again), then refreshes the rest. */
export function useRoleDeleted() {
  const client = useQueryClient();
  const rolesChanged = useRolesChanged();
  return (key: string) => {
    client.removeQueries({ queryKey: queryKeys.role(key) });
    return rolesChanged();
  };
}
