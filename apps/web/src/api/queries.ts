import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api, type Role } from "./client";
import { failedLoad, type FailedLoad } from "./failure";

/**
 * Cache keys. A Role's pages share the "roles" prefix (the list, the Role, who holds it), so one invalidation reaches
 * all of them.
 */
export const queryKeys = {
  roles: ["roles"] as const,
  role: (key: string) => ["roles", key] as const,
  holders: (key: string) => ["roles", key, "holders"] as const,
  catalog: ["catalog"] as const,
  audit: ["audit"] as const,
  auditPage: (page: number, asOf?: number) => ["audit", page, asOf] as const,
  myPermissions: (userId: string) => ["permissions", userId] as const,
};

/**
 * Why a load failed, for the status page that replaces the content, or null. Only while there is nothing to show
 * (a failed refresh keeps the cached content) and not while trying again.
 */
export function loadFailure(query: UseQueryResult): FailedLoad | null {
  return query.isError && !query.isFetching && query.data === undefined
    ? failedLoad(query.error)
    : null;
}

/** Every Role, for the Roles list. */
export function useRoles() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: () => api.roles() });
}

/** One Role with its Grants. */
export function useRole(key: string) {
  return useQuery({ queryKey: queryKeys.role(key), queryFn: () => api.role(key) });
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
  return (updated?: Role) => {
    if (updated) client.setQueryData(queryKeys.role(updated.key), updated);
    return Promise.all([
      client.invalidateQueries({
        queryKey: queryKeys.roles,
        predicate: ({ queryKey }) =>
          !updated || queryKey.length !== 2 || queryKey[1] !== updated.key,
      }),
      client.invalidateQueries({ queryKey: queryKeys.audit }),
      client.invalidateQueries({ queryKey: ["permissions"] }),
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
