import { ProfilePicture } from "@repo/ui/profile-picture";
import { Link } from "react-router";
import type { Issue, IssueSearch } from "../api/client";
import { PriorityMark, StatusPill, TypeBadge } from "./IssueMarks";
import { timeAgo } from "./timeAgo";
import classes from "./IssueViews.module.css";

type Sort = NonNullable<IssueSearch["sort"]>;

/** The Issues as a dense table. Priority and Updated sort on the server, so the arrow marks the one in use. */
export function IssueTable({
  issues,
  sort,
  onSort,
}: {
  issues: Issue[];
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const sortable = (name: Sort, label: string) => (
    <button
      type="button"
      className={classes.sortButton}
      aria-pressed={sort === name}
      onClick={() => onSort(name)}
    >
      {label}
      {sort === name ? " ↓" : ""}
    </button>
  );
  return (
    <div className={classes.tableWrap}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Title</th>
            <th scope="col">Status</th>
            <th scope="col">{sortable("priority", "Priority")}</th>
            <th scope="col">Assignee</th>
            <th scope="col">Type</th>
            <th scope="col">{sortable("updated", "Updated")}</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.id}>
              <td className={classes.cardKey}>{issue.key}</td>
              <td>
                <Link to={`/issues/${encodeURIComponent(issue.key)}`} className={classes.titleLink}>
                  {issue.title}
                </Link>
              </td>
              <td>
                <StatusPill status={issue.status} />
              </td>
              <td>
                <span className={classes.person}>
                  <PriorityMark priority={issue.priority} />
                  {issue.priority}
                </span>
              </td>
              <td>
                <span className={classes.person}>
                  {issue.assignee ? (
                    <>
                      <ProfilePicture
                        name={issue.assignee.displayName}
                        src={issue.assignee.avatarUrl}
                        size={22}
                      />
                      {issue.assignee.displayName}
                    </>
                  ) : (
                    <>
                      <span className={classes.nobody} aria-hidden />
                      Unassigned
                    </>
                  )}
                </span>
              </td>
              <td>
                <span className={classes.person}>
                  <TypeBadge type={issue.type} />
                  {issue.type}
                </span>
              </td>
              <td title={new Date(issue.updatedAt).toLocaleString()}>{timeAgo(issue.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
