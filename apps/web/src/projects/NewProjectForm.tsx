import { ApiError } from "@repo/api";
import { Alert, Button, Group, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { ArrowButton } from "@repo/ui/arrow-button";
import { Panel } from "@repo/ui/panel";
import { toast } from "@repo/ui/toast";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api/client";
import { useProjectCreated } from "../api/queries";
import { keyForName } from "./projectKey";

/**
 * Creates a project, then opens it. The key follows the name until the User types their own (see `keyForName`). A
 * create that finishes after the User went to another page doesn't pull them back. Cancel closes the form, and with
 * it what was typed.
 */
export function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const projectCreated = useProjectCreated();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({ initialValues: { name: "", key: "", description: "" } });
  const left = useRef(false);
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  async function submit(values: typeof form.values) {
    setFailure(null);
    try {
      // The server cleans the description (and says none for a blank one), so every client gets the same rule.
      const project = await api.createProject(values);
      await projectCreated(project);
      toast.success("Project created.");
      if (!left.current) navigate(`/projects/${encodeURIComponent(project.key)}`);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Couldn't create your project. Please try again.";
      if (left.current) {
        // The form is gone, so there is nowhere else to say that the project the User asked for wasn't created.
        toast.error(message);
      } else if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        form.setErrors(error.fieldErrors);
      } else {
        setFailure(message);
      }
    }
  }

  return (
    <Panel p="xl">
      <form onSubmit={(event) => form.onSubmit(submit)(event)}>
        <Stack gap="lg">
          <div>
            <Title order={2} fz={24}>
              New project
            </Title>
            <Text size="sm" c="dimmed" mt={6}>
              Create a project and become its first Member.
            </Text>
          </div>
          {failure && (
            <Alert color="red" role="alert">
              {failure}
            </Alert>
          )}
          <TextInput
            autoFocus
            label="Name"
            placeholder="Nimbus Web"
            required
            maxLength={100}
            disabled={form.submitting}
            {...form.getInputProps("name")}
            onChange={(event) => {
              const name = event.currentTarget.value;
              form.setFieldValue("key", keyForName(form.values.name, name, form.values.key));
              form.setFieldValue("name", name);
            }}
          />
          <TextInput
            label="Project key"
            placeholder="NW"
            required
            maxLength={10}
            description="2–10 letters or digits, starting with a letter. This can't be changed later."
            disabled={form.submitting}
            {...form.getInputProps("key")}
            onChange={(event) => form.setFieldValue("key", event.currentTarget.value.toUpperCase())}
          />
          <Textarea
            label="Description"
            description="Optional"
            placeholder="What is this project for?"
            rows={3}
            maxLength={1000}
            disabled={form.submitting}
            {...form.getInputProps("description")}
          />
          <Group justify="space-between">
            <Button variant="subtle" disabled={form.submitting} onClick={onCancel}>
              Cancel
            </Button>
            <ArrowButton type="submit" loading={form.submitting}>
              Create project
            </ArrowButton>
          </Group>
        </Stack>
      </form>
    </Panel>
  );
}
