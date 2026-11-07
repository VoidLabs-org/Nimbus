import {
  keepPreviousData,
  type QueryClient,
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
 */
export function useProjectIssueStats() {
  return useQuery({
    queryKey: queryKeys.projectIssueStats,
    queryFn: () => api.projectIssueStats(),
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
    client.setQueryData(queryKeys.issue(issue.key), issue);
    void client.invalidateQueries({ queryKey: queryKeys.issueHistory(issue.key) });
    refreshProjectIssues(client, issue.key);
  };
}

/**
 * Board moves sent and not yet answered, per cache, and the Issues whose projects they changed: when the last one
 * finishes, whether it worked or not, every project a finished move changed is refreshed.
 */
const movesInFlight = new WeakMap<QueryClient, { count: number; changed: Set<string> }>();

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
    void client.cancelQueries(lists, { revert: false });
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
    const moves = movesInFlight.get(client) ?? { count: 0, changed: new Set<string>() };
    movesInFlight.set(client, moves);
    moves.count += 1;
    /** One move fewer on its way; the last one refreshes every project a finished move changed. */
    const settle = () => {
      moves.count -= 1;
      if (moves.count > 0) return;
      for (const issueKey of moves.changed) refreshProjectIssues(client, issueKey);
      moves.changed.clear();
    };
    try {
      const saved = await api.moveIssue(issue.key, status.id);
      client.setQueryData(queryKeys.issue(saved.key), saved);
      void client.invalidateQueries({ queryKey: queryKeys.issueHistory(saved.key) });
      moves.changed.add(saved.key);
      settle();
    } catch (error) {
      // Alone, put the Board back as it was; with other moves on their way, the snapshot would undo theirs too, so
      // ask the server instead.
      if (moves.count === 1) for (const [key, data] of snapshot) client.setQueryData(key, data);
      else moves.changed.add(issue.key);
      settle();
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
