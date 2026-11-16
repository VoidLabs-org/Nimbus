import { ApiError } from "@repo/api";
import { Alert, Button } from "@mantine/core";
import { toast } from "@repo/ui/toast";
import { IconArchive, IconArchiveOff } from "@tabler/icons-react";
import { useState } from "react";
import { api, type Project } from "../api/client";
import { useProjectArchiveChanged } from "../api/queries";
import classes from "./ArchiveControls.module.css";

/** Archives or restores a project and keeps the server's answer; a failure is a toast, the project stays as it was. */
function useArchiveAction(project: Project, restore: boolean) {
  const changed = useProjectArchiveChanged();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await changed(
        await (restore ? api.restoreProject(project.key) : api.archiveProject(project.key)),
      );
      toast.success(restore ? "Project restored." : "Project archived.");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Couldn't ${restore ? "restore" : "archive"} the project. Please try again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Archive, on the Overview of an active project. The project can be restored, so it asks for no confirmation. */
export function ArchiveButton({ project }: { project: Project }) {
  const { busy, run } = useArchiveAction(project, false);
  return (
    <Button
      variant="subtle"
      color="red"
      loading={busy}
      leftSection={<IconArchive size={16} aria-hidden />}
      onClick={() => void run()}
    >
      Archive project
    </Button>
  );
}

/** Under the header of an Archived project, on every tab: says it is read-only and offers Restore. */
export function ArchivedBanner({ project }: { project: Project }) {
  const { busy, run } = useArchiveAction(project, true);
  return (
    <Alert
      className={classes.banner}
      variant="light"
      color="gray"
      icon={<IconArchive size={18} aria-hidden />}
      title="This project is archived"
    >
      <div className={classes.body}>
        <span>It is read-only until a Member restores it. Its key stays taken.</span>
        <Button
          size="xs"
          variant="default"
          loading={busy}
          leftSection={<IconArchiveOff size={14} aria-hidden />}
          onClick={() => void run()}
        >
          Restore project
        </Button>
      </div>
    </Alert>
  );
}
