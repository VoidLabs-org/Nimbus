import { useQuery } from "@tanstack/react-query";
import { api, type Issue } from "../api/client";
import { queryKeys, useProject } from "../api/queries";
import { useSession } from "../auth/useSession";

/** What the signed-in User may do with a project's Issues, for hiding what they can't use. */
export type IssuePermissions = {
  /** Whether the server has answered, so a page can tell "not allowed" from "not known yet". */
  loaded: boolean;
  canCreate: boolean;
  canManageStatuses: boolean;
  /** Changing the Issue's fields, Status and Assignee. Scope Own covers the Reporter and the Assignee. */
  canEdit: (issue: Issue) => boolean;
  /** Scope Own covers the Reporter only. */
  canDelete: (issue: Issue) => boolean;
};

/**
 * Reads `GET /api/access/me/permissions?project=`. Nothing is allowed until the server answers. If it can't be
 * asked (the request failed), everything is shown rather than hidden: the server checks every action anyway, and a
 * hidden button can't be retried.
 */
export function useIssuePermissions(projectKey: string | undefined): IssuePermissions {
  const { user } = useSession();
  const userId = user?.id ?? "";
  const project = useProject(projectKey ?? "", projectKey !== undefined);
  const projectId = project.data?.id ?? "";
  const query = useQuery({
    queryKey: queryKeys.myProjectPermissions(userId, projectId),
    queryFn: () => api.myProjectPermissions(projectId),
    enabled: userId !== "" && projectId !== "",
    staleTime: 60_000,
  });
  const held = query.data ?? {};
  const unknown = query.isError;
  return {
    loaded: query.isSuccess || unknown,
    canCreate: unknown || held["issues:issue:create"] !== undefined,
    canManageStatuses: unknown || held["issues:status:manage"] !== undefined,
    canEdit: (issue) =>
      unknown ||
      (held["issues:issue:edit"] === "own"
        ? issue.reporter.id === userId || issue.assignee?.id === userId
        : held["issues:issue:edit"] !== undefined),
    canDelete: (issue) =>
      unknown ||
      (held["issues:issue:delete"] === "own"
        ? issue.reporter.id === userId
        : held["issues:issue:delete"] !== undefined),
  };
}
