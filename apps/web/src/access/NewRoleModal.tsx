import { Alert, Button, Group, Modal, Radio, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, api, type Kind, type NewRoleInput } from "../api/client";
import classes from "./NewRoleModal.module.css";
import { followsName, keyForName, ROLE_KEY } from "./roleKey";

const KINDS: { value: Kind; name: string; hint: string }[] = [
  { value: "project", name: "Project role", hint: "Given to a Member in one project." },
  { value: "platform", name: "Platform role", hint: "Given to a User across all of Nimbus." },
];

const fieldClassNames = { wrapper: classes.field, input: classes.fieldInput, label: classes.label };

/** A field's label with a note, such as "Optional", on its right. */
function FieldLabel({ name, note }: { name: string; note?: string }) {
  return (
    <>
      {name}
      {note && <span className={classes.note}>{note}</span>}
    </>
  );
}

/**
 * Creates a custom Role with no Permissions, then opens it so they can be ticked. Where it applies starts as
 * `initialKind` (the Roles tab it was opened from) until the User picks one. The key follows the name until the
 * User types their own (see `keyForName`), and can't change once the Role exists. Closing it clears the form, and
 * an answer that arrives after closing is ignored.
 */
export function NewRoleModal({
  opened,
  initialKind,
  onClose,
}: {
  opened: boolean;
  initialKind: Kind;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  // null until the User picks one, so the window follows the tab it is opened from.
  const [chosenKind, setChosenKind] = useState<Kind | null>(null);
  const [kindError, setKindError] = useState<string | null>(null);
  // Counts closes, so a create that finishes after the window closed (Cancel during the request) is ignored.
  const closes = useRef(0);
  const kind = chosenKind ?? initialKind;
  const form = useForm<Omit<NewRoleInput, "kind">>({
    initialValues: { name: "", key: "", description: "" },
    validate: {
      name: (value) => (value.trim() ? null : "Enter a name"),
      key: (value) =>
        ROLE_KEY.test(value)
          ? null
          : "Use 2 to 50 lowercase letters, digits and underscores, starting with a letter",
    },
  });

  function close() {
    closes.current += 1;
    form.reset();
    setChosenKind(null);
    setKindError(null);
    setFormError(null);
    onClose();
  }

  async function submit(values: Omit<NewRoleInput, "kind">) {
    setFormError(null);
    setKindError(null);
    const opening = closes.current;
    try {
      const role = await api.createRole({ ...values, kind, name: values.name.trim() });
      if (closes.current !== opening) return;
      close();
      navigate(`/settings/roles/${role.key}`);
    } catch (error) {
      if (closes.current !== opening) return;
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        const { kind: kindMessage, ...fields } = error.fieldErrors;
        form.setErrors(fields);
        setKindError(kindMessage ?? null);
        // An error on a field this window doesn't show still needs saying.
        if (Object.keys(fields).some((field) => !(field in form.values))) {
          setFormError(error.message || "Couldn't create the Role. Please try again.");
        }
      } else {
        setFormError("Couldn't create the Role. Please try again.");
      }
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={close}
      size={560}
      yOffset={24}
      title="New Role"
      classNames={{
        overlay: classes.overlay,
        content: classes.content,
        header: classes.header,
        body: classes.body,
        title: classes.title,
        close: classes.close,
      }}
    >
      <p className={classes.subtitle}>Pick where it applies, then name it.</p>
      <form onSubmit={(event) => form.onSubmit(submit)(event)}>
        <Stack gap={18}>
          {formError && <Alert color="red">{formError}</Alert>}
          <Radio.Group
            label="Where it applies"
            classNames={{ label: classes.label }}
            value={kind}
            onChange={(value) => setChosenKind(value as Kind)}
            error={kindError}
          >
            <div className={classes.kinds}>
              {KINDS.map((kind) => (
                <Radio.Card key={kind.value} value={kind.value} className={classes.kind}>
                  <Radio.Indicator className={classes.kindIndicator} />
                  <div>
                    <div className={classes.kindName}>{kind.name}</div>
                    <div className={classes.kindHint}>{kind.hint}</div>
                  </div>
                </Radio.Card>
              ))}
            </div>
          </Radio.Group>
          <TextInput
            label={<FieldLabel name="Name" />}
            classNames={fieldClassNames}
            {...form.getInputProps("name")}
            onChange={(event) => {
              const name = event.currentTarget.value;
              form.setFieldValue("key", keyForName(form.values.name, name, form.values.key));
              form.setFieldValue("name", name);
            }}
          />
          <TextInput
            label={<FieldLabel name="Key" note="Can't be changed later" />}
            classNames={{ ...fieldClassNames, input: `${classes.fieldInput} ${classes.key}` }}
            rightSection={
              followsName(form.values.name, form.values.key) ? (
                <span className={classes.fromName}>From name</span>
              ) : null
            }
            rightSectionWidth={104}
            {...form.getInputProps("key")}
          />
          <Textarea
            label={<FieldLabel name="Description" note="Optional" />}
            classNames={{ label: classes.label, input: classes.description }}
            // A fixed three lines that scroll, so a long description doesn't grow the window.
            rows={3}
            {...form.getInputProps("description")}
          />
          <div className={classes.footer}>
            <span className={classes.footerNote}>Starts with no Permissions</span>
            <Group gap={10}>
              <Button variant="default" className={classes.cancel} onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={form.submitting}
                className={classes.create}
                rightSection={
                  <span className={classes.arrow} aria-hidden>
                    →
                  </span>
                }
              >
                Create Role
              </Button>
            </Group>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}
