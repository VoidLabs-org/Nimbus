import { Button, Stack, TextInput, Title, VisuallyHidden } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { Loading } from "@repo/ui/skeleton";
import { IconChevronRight, IconSearch, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Project, ProjectIssueStats } from "../api/client";
import { loadFailure, refreshFailed, useProjectIssueStats, useProjects } from "../api/queries";
import toolbar from "../issues/IssueToolbar.module.css";
import { NewProjectModal } from "../projects/NewProjectModal";
import { timeAgo } from "../issues/timeAgo";
import { ProjectBadge } from "../projects/ProjectBadge";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { FailedLoadPage } from "../shell/StatusPages";
import { StaleNotice } from "../shell/StaleNotice";
import { ProjectListSkeleton } from "./ProjectListSkeleton";
import classes from "./ProjectsPage.module.css";

/**
 * The projects the User is a Member of, as a table across the page (a work surface: it fills the width, as the
 * project pages do): key, name, who created it, open Issues, progress and when it last changed, each row opening the
 * project. Search
 * narrows the table as the User types. "New project" opens the New project window; it waits for the list, as "New
 * Role" does, so the window is never open when a failed load replaces the page.
 */
export default function ProjectsPage() {
  const query = useProjects();
  const projects = query.data ?? null;
  const failure = loadFailure(query);
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");

  // Offline or a server error, with nothing cached to show: the status page takes the place of the list.
  if (failure) return <FailedLoadPage failure={failure} onRetry={() => void query.refetch()} />;

  const shown = projects && matching(projects, text);

  return (
    <Stack gap="lg" py="xl">
      <BreadcrumbTrail crumbs={[{ label: "Projects" }]} />
      <div className={classes.header}>
        <Title order={1} fz={44} lh={1.1}>
          Projects
        </Title>
        {projects && (
          <Button size="md" onClick={() => setCreating(true)}>
            New project
          </Button>
        )}
      </div>
      <NewProjectModal opened={creating && !!projects} onClose={() => setCreating(false)} />
      {refreshFailed(query) && (
        <StaleNotice
          title="Couldn't refresh your projects"
          shown="the last loaded list"
          onRetry={() => void query.refetch()}
        />
      )}
      {projects && projects.length > 0 && (
        <Toolbar text={text} onText={setText} count={shown?.length ?? 0} />
      )}
      {projects && shown ? (
        projects.length === 0 ? (
          <Panel p={8}>
            <p className={classes.empty}>No projects to show yet. Create one to get started.</p>
          </Panel>
        ) : shown.length === 0 ? (
          <Panel p={8}>
            <p className={classes.empty}>No projects match “{text.trim()}”.</p>
          </Panel>
        ) : (
          <ProjectTable projects={shown} />
        )
      ) : (
        <Loading>
          <ProjectListSkeleton />
        </Loading>
      )}
    </Stack>
  );
}

/** The projects whose name, key or description has the search text in it, ignoring case. */
function matching(projects: Project[], text: string) {
  const needle = text.trim().toLowerCase();
  if (!needle) return projects;
  return projects.filter((project) =>
    [project.name, project.key, project.description ?? ""].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}

/** Search on the left, the count on the right, as on the Issues toolbar; "/" focuses the search from anywhere. */
function Toolbar({
  text,
  onText,
  count,
}: {
  text: string;
  onText: (text: string) => void;
  count: number;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={classes.toolbar}>
      <TextInput
        ref={searchRef}
        aria-label="Search projects"
        placeholder="Search projects"
        className={toolbar.search}
        classNames={{ input: toolbar.searchInput }}
        leftSection={<IconSearch size={15} aria-hidden />}
        rightSection={
          text ? (
            <button
              type="button"
              className={toolbar.clearSearch}
              aria-label="Clear search text"
              onClick={() => {
                onText("");
                searchRef.current?.focus();
              }}
            >
              <IconX size={13} aria-hidden />
            </button>
          ) : (
            <kbd className={toolbar.kbd} aria-hidden>
              /
            </kbd>
          )
        }
        value={text}
        onChange={(event) => onText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) onText("");
        }}
      />
      <span className={toolbar.count} aria-live="polite">
        {count === 1 ? "1 project" : `${count} projects`}
      </span>
    </div>
  );
}

/**
 * One row per project. The name is the row's link, stretched over the whole row, so the row opens the project and
 * there's still one link per project for screen readers and Tab. Open issues, Progress and Updated come from the
 * projects' Issue totals, one request for all of them, which load after the list; until then they show a placeholder.
 * A project they don't have yet (created a moment ago) shows the placeholder too.
 */
function ProjectTable({ projects }: { projects: Project[] }) {
  const stats = useProjectIssueStats();
  const byKey = new Map((stats.data ?? []).map((entry) => [entry.projectKey, entry]));
  return (
    <div className={classes.tableFrame}>
      <table className={classes.table} aria-label="Your projects">
        <thead>
          <tr>
            <th className={classes.keyCell}>Key</th>
            <th>Name</th>
            <th className={classes.wideOnly}>Created by</th>
            <th className={classes.numberCell}>Open issues</th>
            <th className={classes.wideOnly}>Progress</th>
            <th className={classes.wideOnly}>Members</th>
            <th className={classes.wideOnly}>Updated</th>
            <th aria-hidden />
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} stats={byKey.get(project.key)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRow({
  project,
  stats,
}: {
  project: Project;
  stats: ProjectIssueStats | undefined;
}) {
  const open = stats ? stats.total - stats.done : undefined;
  const progress = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : null;
  // Nothing has happened to its Issues yet: the project's own creation is its latest change.
  const updated = stats?.updatedAt ?? project.createdAt;
  return (
    <tr className={classes.row}>
      <td className={`${classes.keyCell} ${classes.key}`}>{project.key}</td>
      <td>
        <div className={classes.project}>
          <ProjectBadge projectKey={project.key} size="sm" />
          <div className={classes.projectText}>
            <Link to={`/projects/${encodeURIComponent(project.key)}`} className={classes.name}>
              {project.name}
            </Link>
            {project.description && <div className={classes.summary}>{project.description}</div>}
          </div>
        </div>
      </td>
      <td className={classes.wideOnly}>
        {project.createdBy ? (
          <span className={classes.person}>
            <ProfilePicture
              name={project.createdBy.displayName}
              src={project.createdBy.avatarUrl}
              size={22}
            />
            <span className={classes.personName}>{project.createdBy.displayName}</span>
          </span>
        ) : (
          <span className={classes.muted}>Unknown</span>
        )}
      </td>
      <td className={classes.numberCell}>
        {open === undefined ? <span className={classes.bone} aria-hidden /> : open}
      </td>
      <td className={classes.wideOnly}>
        {stats === undefined ? (
          <span className={classes.bone} aria-hidden />
        ) : progress === null ? (
          <span className={classes.muted}>No issues</span>
        ) : (
          <span className={classes.progress}>
            <span
              className={classes.bar}
              role="progressbar"
              aria-label={`${project.name} progress`}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className={classes.fill} style={{ width: `${progress}%` }} />
            </span>
            <span className={classes.percent}>{progress}%</span>
          </span>
        )}
      </td>
      <td className={classes.wideOnly}>
        <Members project={project} />
      </td>
      <td
        className={`${classes.wideOnly} ${classes.muted}`}
        title={new Date(updated).toLocaleString()}
      >
        {stats === undefined ? (
          <span className={classes.bone} aria-hidden />
        ) : (
          `${timeAgo(updated)} ago`
        )}
      </td>
      <td className={classes.arrow} aria-hidden>
        <Glyph icon={IconChevronRight} size={18} />
      </td>
    </tr>
  );
}

/**
 * The project's first Members as overlapping pictures, earliest first, and "+N" for the rest; their names are the
 * tooltip and what a screen reader hears.
 */
function Members({ project }: { project: Project }) {
  const names = project.members.map((member) => member.displayName);
  const more = project.memberCount - project.members.length;
  const label =
    more > 0
      ? `${names.join(", ")} and ${more} more`
      : names.join(", ") || `${project.memberCount} members`;
  return (
    <span className={classes.members} title={label}>
      <span className={classes.faces} aria-hidden>
        {project.members.map((member) => (
          <span key={member.id} className={classes.face}>
            <ProfilePicture name={member.displayName} src={member.avatarUrl} size={24} />
          </span>
        ))}
      </span>
      {more > 0 && (
        <span className={classes.more} aria-hidden>
          +{more}
        </span>
      )}
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
