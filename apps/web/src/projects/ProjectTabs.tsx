import { Link } from "react-router";
import classes from "./ProjectTabs.module.css";

export type ProjectTab = "overview" | "issues" | "settings";

/**
 * A project's tabs (design "Project page layouts", A): Overview, Issues and, for a User who may manage its Statuses,
 * Settings. Links, not buttons, so each tab has its own address.
 */
export function ProjectTabs({
  projectKey,
  current,
  showSettings,
  issueCount,
}: {
  projectKey: string;
  current: ProjectTab;
  showSettings: boolean;
  /** Shown beside Issues once known. */
  issueCount?: number;
}) {
  const base = `/projects/${encodeURIComponent(projectKey)}`;
  const tabs: { id: ProjectTab; label: string; to: string }[] = [
    { id: "overview", label: "Overview", to: `${base}/overview` },
    { id: "issues", label: "Issues", to: `${base}/issues` },
    ...(showSettings
      ? [{ id: "settings" as const, label: "Settings", to: `${base}/settings/statuses` }]
      : []),
  ];
  return (
    <nav className={classes.tabs} aria-label="Project">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          className={classes.tab}
          aria-current={tab.id === current ? "page" : undefined}
        >
          {tab.label}
          {tab.id === "issues" && issueCount !== undefined && (
            <span className={classes.count} aria-label={`, ${issueCount}`}>
              {issueCount.toLocaleString()}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
