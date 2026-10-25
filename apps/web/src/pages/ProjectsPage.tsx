import { Alert, Button, Container, Stack, Title } from "@mantine/core";
import { Glyph } from "@repo/ui/glyph";
import { Panel } from "@repo/ui/panel";
import { Loading } from "@repo/ui/skeleton";
import { Tag } from "@repo/ui/tag";
import { IconArrowRight } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Project } from "../api/client";
import { loadFailure, refreshFailed, useProjects } from "../api/queries";
import { NewProjectForm } from "../projects/NewProjectForm";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { FailedLoadPage } from "../shell/StatusPages";
import { ProjectListSkeleton } from "./ProjectListSkeleton";
import classes from "./ProjectsPage.module.css";

/**
 * The projects the User is a Member of, by name, each opening its page, and "New project", which opens the form
 * above the list. A User with no projects sees why the list is empty. "New project" waits for the list, as "New
 * Role" does, so the form is never open when a failed load replaces the page.
 */
export default function ProjectsPage() {
  const query = useProjects();
  const projects = query.data ?? null;
  const failure = loadFailure(query);
  const [creating, setCreating] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const wasCreating = useRef(false);
  useEffect(() => {
    // Closing the form removes the button that had focus; hand it back to the one that opened the form.
    if (wasCreating.current && !creating) opener.current?.focus();
    wasCreating.current = creating;
  }, [creating]);

  // Offline or a server error, with nothing cached to show: the status page takes the place of the list.
  if (failure) return <FailedLoadPage failure={failure} onRetry={() => void query.refetch()} />;

  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={[{ label: "Projects" }]} />
        <div className={classes.header}>
          <div>
            <Title order={1} fz={40} lh={1.1}>
              Projects
            </Title>
            <div className={classes.description}>A place for your team to plan and track work.</div>
          </div>
          {projects && !creating && (
            <Button ref={opener} onClick={() => setCreating(true)}>
              + New project
            </Button>
          )}
        </div>
        {creating && <NewProjectForm onCancel={() => setCreating(false)} />}
        {refreshFailed(query) && (
          <Alert color="yellow" title="Couldn't refresh your projects">
            Showing the last loaded list.{" "}
            <Button variant="subtle" size="compact-sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </Alert>
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

/** The projects in a panel; each row opens the project. */
function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <Panel p={8}>
      {projects.length === 0 ? (
        <p className={classes.empty}>No projects to show yet. Create one to get started.</p>
      ) : (
        <ul className={classes.list} aria-label="Your projects">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={`/projects/${encodeURIComponent(project.key)}`} className={classes.row}>
                <div className={classes.project}>
                  <div className={classes.name}>
                    {project.name}
                    <Tag>{project.key}</Tag>
                  </div>
                  {project.description && (
                    <div className={classes.summary}>{project.description}</div>
                  )}
                </div>
                <span className={classes.arrow}>
                  <Glyph icon={IconArrowRight} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
