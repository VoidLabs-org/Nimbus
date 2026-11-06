import { useOutletContext } from "react-router";

/** What a project's tab pages get from the layout around them (ProjectLayout). */
export type ProjectOutlet = {
  /** Opens the Create Issue window, or null when the User can't create one here. */
  createIssue: (() => void) | null;
};

/** The layout's `createIssue`, for a page inside it; null outside one. */
export function useProjectOutlet(): ProjectOutlet {
  return useOutletContext<ProjectOutlet | undefined>() ?? { createIssue: null };
}
