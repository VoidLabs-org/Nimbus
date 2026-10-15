import {
  Alert,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, api, type Kind, type NewRoleInput } from "../api/client";
import { ROLE_KEY, suggestKey } from "./roleKey";

/**
 * Creates a custom Role with no Permissions, then opens it so they can be ticked. The key is suggested from the
 * name until the User edits it, and can't change once the Role exists.
 */
export function NewRoleModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [keyEdited, setKeyEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NewRoleInput>({
    initialValues: { name: "", key: "", description: "", kind: "project" },
    validate: {
      name: (value) => (value.trim() ? null : "Enter a name"),
      key: (value) =>
        ROLE_KEY.test(value)
          ? null
          : "Use 2 to 50 lowercase letters, digits and underscores, starting with a letter",
    },
  });

  async function submit(values: NewRoleInput) {
    setFormError(null);
    try {
      const role = await api.createRole({ ...values, name: values.name.trim() });
      onClose();
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
    <Modal opened={opened} onClose={onClose} title="New Role">
      <form onSubmit={form.onSubmit(submit)}>
        <Stack>
          {formError && <Alert color="red">{formError}</Alert>}
          <div>
            <Text size="sm" fw={500} mb={4}>
              Where it applies
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { value: "project", label: "Project role" },
                { value: "platform", label: "Platform role" },
              ]}
              {...form.getInputProps("kind")}
              onChange={(kind) => form.setFieldValue("kind", kind as Kind)}
            />
            <Text size="xs" c="dimmed" mt={4}>
              {form.values.kind === "project"
                ? "Given to a Member in one project."
                : "Given to a User across all of Nimbus."}
            </Text>
          </div>
          <TextInput
            label="Name"
            {...form.getInputProps("name")}
            onChange={(event) => {
              const name = event.currentTarget.value;
              form.setFieldValue("name", name);
              if (!keyEdited) form.setFieldValue("key", suggestKey(name));
            }}
          />
          <TextInput
            label="Key"
            description="Can't be changed later."
            ff="monospace"
            {...form.getInputProps("key")}
            onChange={(event) => {
              setKeyEdited(true);
              form.setFieldValue("key", event.currentTarget.value);
            }}
          />
          <Textarea
            label="Description"
            autosize
            minRows={2}
            {...form.getInputProps("description")}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={form.submitting}>
              Create Role
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
