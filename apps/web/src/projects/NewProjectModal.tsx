import { ApiError } from "@repo/api";
import { Alert, Button, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { toast } from "@repo/ui/toast";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api/client";
import { useProjectCreated, useProjects } from "../api/queries";
import { FieldLabel } from "../access/RoleFormParts";
import { WindowFrame } from "../access/WindowFrame";
import {
  descriptionClassNames,
  fieldClassNames,
  formClassName,
} from "../access/roleFormClassNames";
import classes from "./NewProjectModal.module.css";
import { keyForName } from "./projectKey";

const DESCRIPTION_LIMIT = 1000;

/** Code points, as the server counts them, so an emoji is one character, not two. */
const characters = (text: string) => [...text].length;

/**
 * The checks the server makes that the window can make first. Of taken keys it knows only those of the User's own
 * projects (`taken`); one used by a project they aren't a Member of is still the server's to say.
 */
function rulesFor(taken: ReadonlySet<string>) {
  return {
    name: (value: string) => (value.trim() ? null : "Enter a name."),
    key: (value: string) => {
      if (value === "") return "Enter a key.";
      if (!/^[A-Z][A-Z0-9]{1,9}$/.test(value))
        return "Use 2 to 10 letters or digits, starting with a letter.";
      return taken.has(value) ? `${value} is already used by one of your projects.` : null;
    },
    description: (value: string) =>
      characters(value) > DESCRIPTION_LIMIT ? `Keep it to ${DESCRIPTION_LIMIT} characters.` : null,
  };
}
type Field = keyof ReturnType<typeof rulesFor>;

/**
 * The New project window (design "Nimbus Themes", 33c and 33d): creates a project, then opens it. The key follows the
 * name until the User types their own (see `keyForName`). A field is checked when the User leaves it, and once it
 * shows an error, again as they type, so the error goes as soon as it is fixed; a key one of the User's projects
 * already has is said at once. Closing it clears the form. A create that finishes after the
 * window closed, or after the User went to another page, doesn't pull them back; if it failed, a toast says so, as
 * there is nowhere else left to say it.
 */
export function NewProjectModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const projectCreated = useProjectCreated();
  const [failure, setFailure] = useState<string | null>(null);
  // The list the Projects page has already loaded, from the cache.
  const projects = useProjects().data;
  const rules = rulesFor(new Set(projects?.map((project) => project.key)));
  const form = useForm({
    initialValues: { name: "", key: "", description: "" },
    validate: rules,
    validateInputOnBlur: true,
  });
  // Counts closes, so an answer that arrives after the window closed is not shown in it.
  const closes = useRef(0);
  const left = useRef(false);
  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  /**
   * Sets a field and, if it is showing an error, checks it again, so the error clears as soon as it is fixed. A key
   * that is already taken is said at once, as it is wrong however the User goes on.
   */
  function change(field: Field, value: string) {
    form.setFieldValue(field, value);
    const error = rules[field](value);
    if (form.errors[field] || (field === "key" && error && taken(value)))
      form.setFieldError(field, error);
  }

  const taken = (key: string) => projects?.some((project) => project.key === key) ?? false;

  function close() {
    closes.current += 1;
    form.reset();
    setFailure(null);
    onClose();
  }

  async function submit(values: typeof form.values) {
    setFailure(null);
    const opening = closes.current;
    const gone = () => left.current || closes.current !== opening;
    try {
      // The server cleans the description (and says none for a blank one), so every client gets the same rule.
      const project = await api.createProject(values);
      await projectCreated(project);
      toast.success("Project created.");
      if (gone()) return;
      close();
      navigate(`/projects/${encodeURIComponent(project.key)}`);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Couldn't create your project. Please try again.";
      if (gone()) toast.error(message);
      else if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0)
        form.setErrors(error.fieldErrors);
      else setFailure(message);
    }
  }

  const key = form.values.key;
  return (
    <WindowFrame
      opened={opened}
      onClose={close}
      title="New project"
      subtitle="You'll be its first member."
    >
      <form noValidate className={classes.form} onSubmit={(event) => form.onSubmit(submit)(event)}>
        <div className={formClassName}>
          {failure && (
            <Alert color="red" role="alert">
              {failure}
            </Alert>
          )}
          <TextInput
            data-autofocus
            label={<FieldLabel name="Name" />}
            placeholder="Nimbus Web"
            maxLength={100}
            disabled={form.submitting}
            classNames={{ ...fieldClassNames, error: classes.error }}
            {...form.getInputProps("name")}
            onChange={(event) => {
              const name = event.currentTarget.value;
              const key = keyForName(form.values.name, name, form.values.key);
              if (key !== form.values.key) change("key", key);
              change("name", name);
            }}
          />
          <TextInput
            label={<FieldLabel name="Project key" note="Can't be changed later" />}
            placeholder="NW"
            maxLength={10}
            // The error takes the hint's place, as in the design.
            description={
              form.errors.key
                ? undefined
                : "Suggested from the name. 2 to 10 letters or digits, starting with a letter."
            }
            inputWrapperOrder={["label", "input", "description", "error"]}
            inputContainer={(input) => (
              <div className={classes.keyRow}>
                {input}
                {key && (
                  <span className={classes.preview}>
                    Issues will be <b>{key}-1</b>, <b>{key}-2</b>…
                  </span>
                )}
              </div>
            )}
            disabled={form.submitting}
            classNames={{
              ...fieldClassNames,
              input: `${fieldClassNames.input} ${classes.key}`,
              description: classes.hint,
              error: classes.error,
            }}
            {...form.getInputProps("key")}
            onChange={(event) => change("key", event.currentTarget.value.toUpperCase())}
          />
          <Textarea
            label={
              <FieldLabel
                name="Description"
                note={`Optional · ${characters(form.values.description).toLocaleString()} / ${DESCRIPTION_LIMIT}`}
              />
            }
            // A fixed three lines that scroll, so a long description doesn't grow the window.
            // No maxLength: a longer paste is kept and said to be too long, rather than cut off unseen.
            rows={3}
            disabled={form.submitting}
            classNames={{ ...descriptionClassNames, error: classes.error }}
            {...form.getInputProps("description")}
            onChange={(event) => change("description", event.currentTarget.value)}
          />
          <div className={classes.footer}>
            <Button
              variant="subtle"
              className={`${classes.button} ${classes.cancel}`}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" className={classes.button} loading={form.submitting}>
              Create project
            </Button>
          </div>
        </div>
      </form>
    </WindowFrame>
  );
}
