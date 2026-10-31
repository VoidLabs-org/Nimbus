import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api, type Project, type Role } from "./client";
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
  roles: ["roles"] as const,
  role: (key: string) => ["roles", key] as const,
  holders: (key: string) => ["roles", key, "holders"] as const,
  catalog: ["catalog"] as const,
  audit: ["audit"] as const,
  auditPage: (page: number, asOf?: number) => ["audit", page, asOf] as const,
  permissions: ["permissions"] as const,
  myPermissions: (userId: string) => ["permissions", userId] as const,
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
export function useProject(key: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.project(key),
    queryFn: () => api.project(key),
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
