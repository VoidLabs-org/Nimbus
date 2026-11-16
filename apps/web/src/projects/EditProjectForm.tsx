import { ApiError } from "@repo/api";
import { Alert, Button, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import { api, type Project } from "../api/client";
import { useProjectUpdated } from "../api/queries";
import classes from "./EditProjectForm.module.css";

const NAME_LIMIT = 100;
const DESCRIPTION_LIMIT = 1000;

/** Code points, as the server counts them, so an emoji is one character, not two. */
const characters = (text: string) => [...text].length;

/**
 * Renames a project and edits or clears its description, in place of the Overview's description. The same checks as
 * the New project window, made when the form is sent; the server's field errors appear on their fields. The key is
 * shown and never editable. Only what changed is sent, so saving without a change closes the form without asking.
 */
export function EditProjectForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const projectUpdated = useProjectUpdated();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({
    initialValues: { name: project.name, description: project.description ?? "" },
    validate: {
      name: (value) => {
        const name = value.trim();
        if (!name) return "Enter a name.";
        return characters(name) > NAME_LIMIT ? `Keep it to ${NAME_LIMIT} characters.` : null;
      },
      // The server trims both ends first, so only what is left counts.
      description: (value) =>
        characters(value.trim()) > DESCRIPTION_LIMIT
          ? `Keep it to ${DESCRIPTION_LIMIT} characters.`
          : null,
    },
  });

  async function submit(values: typeof form.values) {
    setFailure(null);
    // The server cleans both, so an unchanged field is only compared as it was typed.
    const changes: { name?: string; description?: string | null } = {};
    if (values.name !== project.name) changes.name = values.name;
    if (values.description !== (project.description ?? ""))
      changes.description = values.description;
    if (Object.keys(changes).length === 0) return onDone();
    try {
      await projectUpdated(await api.updateProject(project.key, changes));
      toast.success("Project updated.");
      onDone();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0)
        form.setErrors(error.fieldErrors);
      else
        setFailure(
          error instanceof ApiError
            ? error.message
            : "Couldn't save the project. Please try again.",
        );
    }
  }

  return (
    <form
      noValidate
      className={classes.form}
      aria-label="Edit project"
      onSubmit={(event) => form.onSubmit(submit)(event)}
    >
      {failure && (
        <Alert color="red" role="alert">
          {failure}
        </Alert>
      )}
      <TextInput
        data-autofocus
        label="Name"
        disabled={form.submitting}
        {...form.getInputProps("name")}
      />
      <TextInput
        label="Project key"
        description="Can't be changed"
        value={project.key}
        readOnly
        disabled
      />
      <Textarea
        label="Description"
        description={`Optional · ${characters(form.values.description).toLocaleString()} / ${DESCRIPTION_LIMIT}`}
        rows={4}
        autosize={false}
        disabled={form.submitting}
        {...form.getInputProps("description")}
      />
      <div className={classes.footer}>
        <Button variant="subtle" onClick={onDone} disabled={form.submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={form.submitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
