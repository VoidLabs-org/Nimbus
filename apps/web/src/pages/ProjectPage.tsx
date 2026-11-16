import { Button, Stack } from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { useState } from "react";
import { Bone, Loading } from "@repo/ui/skeleton";
import { Navigate, useLocation, useParams } from "react-router";
import { refreshFailed, useProject } from "../api/queries";
import classes from "./ProjectPage.module.css";
import { StaleNotice } from "../shell/StaleNotice";
import { EditProjectForm } from "../projects/EditProjectForm";

/** `/projects/:key`: a project opens on its Issues tab, keeping any query string (`?view=board`). */
export function ProjectHome() {
  const { key = "" } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/projects/${encodeURIComponent(key)}/issues${search}`} replace />;
}

/**
 * A project's Overview tab: its description, under the header and tabs that ProjectLayout draws (which also says
 * when the project can't be found), with an Edit button for its name and description (not for an Archived project).
 * Archiving belongs to a following ticket.
 */
export default function ProjectPage() {
  const { key = "" } = useParams();
  const query = useProject(key);
  const project = query.data;
  // The key it is open for, so an edit left open on one project doesn't show on another.
  const [editingIn, setEditingIn] = useState<string | null>(null);
  // ProjectLayout says when the project can't be found or loaded; until it arrives, the description's shape.
  if (!project) {
    return (
      <Loading>
        <section className={classes.about}>
          <Stack gap={10}>
            <Bone width="70%" height={16} />
            <Bone width="45%" height={16} />
          </Stack>
        </section>
      </Loading>
    );
  }

  return (
    <>
      {refreshFailed(query) && (
        <StaleNotice
          title="Couldn't refresh this project"
          shown="the last loaded details"
          onRetry={() => void query.refetch()}
        />
      )}
      <section className={classes.about} aria-label="About this project">
        {editingIn === project.key ? (
          <EditProjectForm project={project} onDone={() => setEditingIn(null)} />
        ) : (
          <>
            <p className={classes.description} data-empty={!project.description || undefined}>
              {project.description || "No description yet."}
            </p>
            {!project.archived && (
              <Button
                variant="subtle"
                className={classes.edit}
                leftSection={<IconPencil size={16} aria-hidden />}
                onClick={() => setEditingIn(project.key)}
              >
                Edit
              </Button>
            )}
          </>
        )}
      </section>
    </>
  );
}
