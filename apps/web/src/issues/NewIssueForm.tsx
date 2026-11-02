import { ApiError } from "@repo/api";
import {
  Alert,
  Button,
  Group,
  Select,
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
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api, type Issue } from "../api/client";
import { useIssueCreated } from "../api/queries";
import { useSession } from "../auth/useSession";

const TYPES = ["Story", "Bug", "Chore"] as const;
const PRIORITIES = ["Urgent", "High", "Medium", "Low"] as const;
const UNASSIGNED = "unassigned";

/**
 * Creates an Issue in a project, then opens it. Until the project's Members can be listed, the only Assignee on offer
 * is the User themself. A create that finishes after the User went to another page doesn't pull them back.
 */
export function NewIssueForm({
  projectKey,
  onCancel,
}: {
  projectKey: string;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useSession();
  const issueCreated = useIssueCreated();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({
    initialValues: {
      type: "Story" as Issue["type"],
      title: "",
      description: "",
      priority: "Medium" as Issue["priority"],
      assigneeId: UNASSIGNED,
    },
  });
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
      const issue = await api.createIssue(projectKey, {
        type: values.type,
        title: values.title,
        description: values.description || null,
        priority: values.priority,
        assigneeId: values.assigneeId === UNASSIGNED ? null : values.assigneeId,
      });
      issueCreated(issue);
      toast.success(`${issue.key} created.`);
      if (!left.current) navigate(`/issues/${encodeURIComponent(issue.key)}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Couldn't create your Issue. Please try again.";
      if (left.current) {
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
              Create Issue
            </Title>
            <Text size="sm" c="dimmed" mt={6}>
              It starts in the project's first To do Status, and you are its Reporter.
            </Text>
          </div>
          {failure && (
            <Alert color="red" role="alert">
              {failure}
            </Alert>
          )}
          <Select
            label="Issue type"
            required
            allowDeselect={false}
            data={[...TYPES]}
            disabled={form.submitting}
            {...form.getInputProps("type")}
          />
          <TextInput
            autoFocus
            label="Title"
            required
            maxLength={255}
            disabled={form.submitting}
            {...form.getInputProps("title")}
          />
          <Textarea
            label="Description"
            description="Optional. Markdown works, including checklists like - [ ] for acceptance criteria."
            rows={6}
            maxLength={50000}
            autosize
            minRows={6}
            maxRows={16}
            disabled={form.submitting}
            {...form.getInputProps("description")}
          />
          <Select
            label="Priority"
            allowDeselect={false}
            data={[...PRIORITIES]}
            disabled={form.submitting}
            {...form.getInputProps("priority")}
          />
          <Select
            label="Assignee"
            allowDeselect={false}
            data={[
              { value: UNASSIGNED, label: "Unassigned" },
              ...(user ? [{ value: user.id, label: user.displayName }] : []),
            ]}
            disabled={form.submitting}
            {...form.getInputProps("assigneeId")}
          />
          <Group justify="space-between">
            <Button variant="subtle" disabled={form.submitting} onClick={onCancel}>
              Cancel
            </Button>
            <ArrowButton type="submit" loading={form.submitting}>
              Create Issue
            </ArrowButton>
          </Group>
        </Stack>
      </form>
    </Panel>
  );
}
