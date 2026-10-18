import {
  Alert,
  Button,
  Container,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { ArrowButton } from "@repo/ui/arrow-button";
import { Panel } from "@repo/ui/panel";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api, ApiError } from "../api/client";
import { useProjectCreated } from "../api/queries";
import { suggestKey } from "../projects/projectKey";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";

/** The Projects entry point; the project list is added by ticket #39. */
export default function ProjectsPage() {
  const navigate = useNavigate();
  const projectCreated = useProjectCreated();
  const [keyEdited, setKeyEdited] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({ initialValues: { name: "", key: "", description: "" } });

  async function submit(values: typeof form.values) {
    setFailure(null);
    try {
      const project = await api.createProject({
        ...values,
        description: values.description || null,
      });
      await projectCreated(project);
      toast.success("Project created.");
      navigate(`/projects/${encodeURIComponent(project.key)}`);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        form.setErrors(error.fieldErrors);
      } else {
        setFailure(
          error instanceof ApiError
            ? error.message
            : "Couldn't create your project. Please try again.",
        );
      }
    }
  }

  return (
    <Container size="sm" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={[{ label: "Projects" }]} />
        <div>
          <Title order={1} fz={40} lh={1.1}>
            Projects
          </Title>
          <Text c="dimmed" mt="xs">
            A place for your team to plan and track work.
          </Text>
        </div>
        <Panel p="xl">
          <form onSubmit={form.onSubmit(submit)}>
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
                label="Name"
                placeholder="Nimbus Web"
                required
                maxLength={100}
                disabled={form.submitting}
                {...form.getInputProps("name")}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  form.setFieldValue("name", name);
                  if (!keyEdited) form.setFieldValue("key", suggestKey(name));
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
                onChange={(event) => {
                  setKeyEdited(true);
                  form.setFieldValue("key", event.currentTarget.value.toUpperCase());
                }}
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
                <Button
                  variant="subtle"
                  disabled={form.submitting}
                  onClick={() => {
                    form.reset();
                    setKeyEdited(false);
                    setFailure(null);
                  }}
                >
                  Clear
                </Button>
                <ArrowButton type="submit" loading={form.submitting}>
                  Create project
                </ArrowButton>
              </Group>
            </Stack>
          </form>
        </Panel>
      </Stack>
    </Container>
  );
}
