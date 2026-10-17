import { Alert, Button, Group, Modal, Radio, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
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
 * `initialKind` (the Roles tab it was opened from). The key follows the name until the User types their own (see
 * `keyForName`), and can't change once the Role exists. Closing it clears the form.
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
  const form = useForm<NewRoleInput>({
    initialValues: { name: "", key: "", description: "", kind: initialKind },
    validate: {
      name: (value) => (value.trim() ? null : "Enter a name"),
      key: (value) =>
        ROLE_KEY.test(value)
          ? null
          : "Use 2 to 50 lowercase letters, digits and underscores, starting with a letter",
    },
  });

  function close() {
    form.reset();
    setFormError(null);
    onClose();
  }

  async function submit(values: NewRoleInput) {
    setFormError(null);
    try {
      const role = await api.createRole({ ...values, name: values.name.trim() });
      close();
      navigate(`/settings/roles/${role.key}`);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        form.setErrors(error.fieldErrors);
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
      title={
        <>
          New Role
          <div className={classes.subtitle}>Pick where it applies, then name it.</div>
        </>
      }
      classNames={{
        overlay: classes.overlay,
        content: classes.content,
        header: classes.header,
        body: classes.body,
        title: classes.title,
        close: classes.close,
      }}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap={18}>
          {formError && <Alert color="red">{formError}</Alert>}
          <Radio.Group
            label="Where it applies"
            classNames={{ label: classes.label }}
            value={form.values.kind}
            onChange={(kind) => form.setFieldValue("kind", kind as Kind)}
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
