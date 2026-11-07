import { ApiError } from "@repo/api";
import { ActionIcon, Button, Container, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconArchive, IconPlus } from "@tabler/icons-react";
import { Bone, Loading } from "@repo/ui/skeleton";
import { useState } from "react";
import { matchPath, Outlet, useLocation, useParams } from "react-router";
import { loadFailure, useIssueCounts, useProject } from "../api/queries";
import { NewIssueForm } from "../issues/NewIssueForm";
import { useIssuePermissions } from "../issues/useIssuePermissions";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import type { Crumb } from "../shell/crumbs";
import { PrimaryAction, StatusPage } from "../shell/StatusPage";
import { FailedLoadPage } from "../shell/StatusPages";
import { ProjectBadge } from "./ProjectBadge";
import type { ProjectOutlet } from "./projectOutlet";
import { ProjectTabs, type ProjectTab } from "./ProjectTabs";
import classes from "./ProjectLayout.module.css";

const TAB_LABELS: Record<ProjectTab, string> = {
  overview: "Overview",
  issues: "Issues",
  settings: "Settings",
};

/** Which tab an address under `/projects/:key` belongs to. */
function tabOf(pathname: string): ProjectTab {
  if (matchPath("/projects/:key/settings/*", pathname)) return "settings";
  if (matchPath("/projects/:key/overview", pathname)) return "overview";
  return "issues";
}

/**
 * Every page of a project (design "Project page layouts", A): the breadcrumb, a header with the project's badge, name
 * and key and Create Issue, and the Overview, Issues and Settings tabs under it, left-aligned. Drawn once around the
 * tab's page, at one width, so nothing on a page can move the tabs. An unknown project, or one the User isn't a
 * Member of, shows Project not found in place of all of it.
 */
export function ProjectLayout() {
  const { key = "" } = useParams();
  const { pathname } = useLocation();
  const query = useProject(key);
  const project = query.data;
  const permissions = useIssuePermissions(project?.key);
  const failure = loadFailure(query);
  // Every Issue of the project, for the count beside the Issues tab.
  const counts = useIssueCounts(key, {});
  const phone = useMediaQuery("(max-width: 48em)");
  // The project the window is open for, so a window opened on one project is not still open on another.
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const tab = tabOf(pathname);

  if (query.error instanceof ApiError && query.error.status === 404 && !query.isFetching) {
    return (
      <StatusPage
        eyebrow="Error 404"
        title="Project not found."
        body="Check the project link or ask a project Member for help."
        code="404"
        name="Not found"
        actions={<PrimaryAction to="/projects">Go to Projects</PrimaryAction>}
      />
    );
  }
  if (failure) return <FailedLoadPage failure={failure} onRetry={() => void query.refetch()} />;

  // An Archived project takes no new Issues.
  const canCreate = project !== undefined && !project.archived && permissions.canCreate;
  const createIssue = canCreate ? () => setCreatingIn(project.key) : null;
  const crumbs: Crumb[] = [
    { label: "Projects", to: "/projects" },
    project
      ? tab === "overview"
        ? { label: project.name }
        : { label: project.name, to: `/projects/${encodeURIComponent(project.key)}/overview` }
      : { label: "", pending: true },
    ...(tab === "overview" ? [] : [{ label: TAB_LABELS[tab] }]),
  ];

  return (
    <Container fluid px={0} py="xl" className={classes.page}>
      <Stack gap="lg">
        {/* A project's other tabs add its name, "Apollo · Issues", so two projects' Desktop Tabs tell apart. */}
        <BreadcrumbTrail
          crumbs={crumbs}
          tabTitle={
            project
              ? tab === "overview"
                ? project.name
                : `${project.name} · ${TAB_LABELS[tab]}`
              : null
          }
        />
        <div className={classes.top}>
          <div className={classes.header}>
            {project ? (
              <>
                <ProjectBadge projectKey={project.key} size="sm" />
                <div className={classes.title}>
                  <h1 className={classes.name}>{project.name}</h1>
                  <div className={classes.key}>
                    <span className={classes.code}>{project.key}</span>
                    {project.archived && (
                      <span className={classes.archived}>
                        <IconArchive size={13} aria-hidden />
                        Archived · read-only
                      </span>
                    )}
                  </div>
                </div>
                {createIssue &&
                  (phone ? (
                    <ActionIcon
                      size={44}
                      radius="xl"
                      variant="filled"
                      aria-label="Create Issue"
                      onClick={createIssue}
                    >
                      <IconPlus size={20} aria-hidden />
                    </ActionIcon>
                  ) : (
                    <Button
                      radius="xl"
                      className={classes.create}
                      leftSection={<IconPlus size={16} aria-hidden />}
                      onClick={createIssue}
                    >
                      Create Issue
                    </Button>
                  ))}
              </>
            ) : (
              <Loading>
                <div className={classes.header}>
                  <Bone width={44} height={44} radius={999} />
                  <Stack gap={6}>
                    <Bone width={220} height={28} />
                    <Bone width={60} height={14} />
                  </Stack>
                </div>
              </Loading>
            )}
          </div>
          <ProjectTabs
            projectKey={project?.key ?? key}
            current={tab}
            showSettings={permissions.canManageStatuses}
            issueCount={counts.data?.total}
          />
        </div>
        {project && (
          <NewIssueForm
            opened={creatingIn === project.key}
            projectKey={project.key}
            projectName={project.name}
            onClose={() => setCreatingIn(null)}
          />
        )}
        <Outlet context={{ createIssue } satisfies ProjectOutlet} />
      </Stack>
    </Container>
  );
}
