import { ApiError } from "@repo/api";
import { Alert, Button, Checkbox, Select, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { ArrowButton } from "@repo/ui/arrow-button";
import { toast } from "@repo/ui/toast";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { WindowFrame } from "../access/WindowFrame";
import { api, type Issue } from "../api/client";
import { useIssueCreated } from "../api/queries";
import { useSession } from "../auth/useSession";
import { TypeBadge } from "./IssueMarks";
import { MarkdownField } from "./MarkdownField";
import classes from "./NewIssueForm.module.css";

const TYPES = ["Story", "Bug", "Chore"] as const;
const PRIORITIES = ["Urgent", "High", "Medium", "Low"] as const;
const UNASSIGNED = "unassigned";
const TITLE_MAX = 255;

const initialValues = {
  type: "Story" as Issue["type"],
  title: "",
  description: "",
  priority: "Medium" as Issue["priority"],
  assigneeId: UNASSIGNED,
};

/**
 * The Create Issue window: creates an Issue in a project, then opens it, or, with "Create another", stays for the next
 * one. Until the project's Members can be listed, the only Assignee on offer is the User themself. Closing the window
 * clears it, and a create that finishes after it closed or the User went to another page doesn't pull them back.
 */
/** Nothing is mounted while the window is closed, so a page that offers it doesn't need a Session until it opens. */
export function NewIssueForm(props: {
  opened: boolean;
  projectKey: string;
  projectName?: string;
  onClose: () => void;
}) {
  return props.opened ? <CreateIssueWindow {...props} /> : null;
}

function CreateIssueWindow({
  opened,
  projectKey,
  projectName,
  onClose,
}: {
  opened: boolean;
  projectKey: string;
  projectName?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useSession();
  const issueCreated = useIssueCreated();
  const [failure, setFailure] = useState<string | null>(null);
  const [another, setAnother] = useState(false);
  const form = useForm({ initialValues });
  // Counts closes, so a create that finishes after the window closed is ignored, like an unmounted one.
  const closes = useRef(0);
  const left = useRef(false);
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  function close() {
    closes.current += 1;
    form.reset();
    setFailure(null);
    onClose();
  }

  async function submit(values: typeof form.values) {
    setFailure(null);
    const opening = closes.current;
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
      if (left.current || closes.current !== opening) return;
      if (another) {
        form.setValues({ ...initialValues, type: values.type, priority: values.priority });
        return;
      }
      close();
      navigate(`/issues/${encodeURIComponent(issue.key)}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Couldn't create your Issue. Please try again.";
      if (left.current || closes.current !== opening) {
        toast.error(message);
      } else if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        form.setErrors(error.fieldErrors);
      } else {
        setFailure(message);
      }
    }
  }

  return (
    <WindowFrame
      opened={opened}
      onClose={close}
      title="Create Issue"
      subtitle={projectName ? `${projectName} · starts in To do` : "Starts in To do"}
    >
      <form onSubmit={(event) => form.onSubmit(submit)(event)}>
        <div className={classes.form}>
          {failure && (
            <Alert color="red" role="alert">
              {failure}
            </Alert>
          )}
          <div className={classes.types} role="radiogroup" aria-label="Issue type">
            {TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={form.values.type === type}
                className={classes.type}
                disabled={form.submitting}
                onClick={() => form.setFieldValue("type", type)}
              >
                <TypeBadge type={type} />
                {type}
              </button>
            ))}
          </div>
          <TextInput
            autoFocus
            label="Title"
            required
            maxLength={TITLE_MAX}
            radius="xl"
            rightSection={
              <span className={classes.count}>
                {form.values.title.length} / {TITLE_MAX}
              </span>
            }
            rightSectionWidth={72}
            disabled={form.submitting}
            {...form.getInputProps("title")}
          />
          <div>
            <div className={classes.fieldLabel}>
              <span>Description</span>
              <span className={classes.note}>Markdown · optional</span>
            </div>
            <MarkdownField
              label="Description"
              maxLength={50000}
              disabled={form.submitting}
              value={form.values.description}
              onChange={(value) => form.setFieldValue("description", value)}
              error={typeof form.errors.description === "string" ? form.errors.description : null}
            />
          </div>
          <div className={classes.pair}>
            <Select
              label="Priority"
              radius="xl"
              allowDeselect={false}
              data={[...PRIORITIES]}
              disabled={form.submitting}
              {...form.getInputProps("priority")}
            />
            <Select
              label="Assignee"
              radius="xl"
              allowDeselect={false}
              data={[
                { value: UNASSIGNED, label: "Unassigned" },
                ...(user ? [{ value: user.id, label: `${user.displayName} (you)` }] : []),
              ]}
              disabled={form.submitting}
              {...form.getInputProps("assigneeId")}
            />
          </div>
          <div className={classes.footer}>
            <Checkbox
              label="Create another"
              checked={another}
              onChange={(event) => setAnother(event.currentTarget.checked)}
            />
            <div className={classes.actions}>
              <Button variant="subtle" disabled={form.submitting} onClick={close}>
                Cancel
              </Button>
              <ArrowButton type="submit" loading={form.submitting}>
                Create Issue
              </ArrowButton>
            </div>
          </div>
        </div>
      </form>
    </WindowFrame>
  );
}
