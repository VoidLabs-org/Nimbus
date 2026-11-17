import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { queryKeys, useProject } from "../api/queries";
import { useSession } from "../auth/useSession";

/**
 * Whether the signed-in User may manage a project's Members, from `GET /api/access/me/permissions?project=`. Nothing
 * is offered until the server answers; if it can't be asked everything is shown, as for Issues, since the server
 * checks every change anyway and a hidden button can't be retried.
 */
export function useMemberPermissions(projectKey: string | undefined) {
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
  return {
    loaded: query.isSuccess || query.isError,
    canManage: query.isError || query.data?.["projects:member:manage"] !== undefined,
  };
}
