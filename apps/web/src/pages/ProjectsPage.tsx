import { Button, Container, Stack, Title } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { Loading } from "@repo/ui/skeleton";
import { IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Project } from "../api/client";
import { loadFailure, refreshFailed, useProjects } from "../api/queries";
import { NewProjectModal } from "../projects/NewProjectModal";
import { ProjectBadge } from "../projects/ProjectBadge";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { FailedLoadPage } from "../shell/StatusPages";
import { ProjectListSkeleton } from "./ProjectListSkeleton";
import classes from "./ProjectsPage.module.css";
import { StaleNotice } from "../shell/StaleNotice";

/**
 * The projects the User is a Member of, by name, each opening its page, and "New project", which opens the New
 * project window. A User with no projects sees why the list is empty. "New project" waits for the list, as "New
 * Role" does, so the window is never open when a failed load replaces the page.
 */
export default function ProjectsPage() {
  const query = useProjects();
  const projects = query.data ?? null;
  const failure = loadFailure(query);
  const [creating, setCreating] = useState(false);

  // Offline or a server error, with nothing cached to show: the status page takes the place of the list.
  if (failure) return <FailedLoadPage failure={failure} onRetry={() => void query.refetch()} />;

  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
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
        {projects ? (
          <ProjectList projects={projects} />
        ) : (
          <Loading>
            <ProjectListSkeleton />
          </Loading>
        )}
      </Stack>
    </Container>
  );
}

/** One pill per project, its key in a round badge; each row opens the project. */
function ProjectList({ projects }: { projects: Project[] }) {
  if (projects.length === 0)
    return (
      <Panel p={8}>
        <p className={classes.empty}>No projects to show yet. Create one to get started.</p>
      </Panel>
    );
  return (
    <ul className={classes.list} aria-label="Your projects">
      {projects.map((project) => (
        <li key={project.id}>
          <Link to={`/projects/${encodeURIComponent(project.key)}`} className={classes.row}>
            <ProjectBadge projectKey={project.key} />
            <div className={classes.project}>
              <div className={classes.name}>{project.name}</div>
              {project.description && <div className={classes.summary}>{project.description}</div>}
            </div>
            <span className={classes.arrow}>
              <Glyph icon={IconChevronRight} size={20} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
