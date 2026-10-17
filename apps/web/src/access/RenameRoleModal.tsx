import { Alert, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { ApiError, api, type Role } from "../api/client";
import { RoleFormFooter } from "./RoleFormParts";
import { WindowFrame } from "./WindowFrame";
import { descriptionClassNames, fieldClassNames, formClassName } from "./roleFormClassNames";

/**
 * Changes a Role's name and description, in the same window as New Role. Mount it when it opens, so the form starts
 * from the Role as it is then. A version conflict or any other refusal is shown inside the window.
 */
export function RenameRoleModal({
  role,
  onClose,
  onChanged,
}: {
  role: Role;
  onClose: () => void;
  onChanged: (role: Role) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { name: role.name, description: role.description },
    validate: { name: (value) => (value.trim() ? null : "Enter a name") },
  });

  async function submit(values: { name: string; description: string }) {
    setFormError(null);
    try {
      onChanged(
        await api.describeRole(role.key, {
          name: values.name.trim(),
          description: values.description.trim(),
          version: role.version,
        }),
      );
      onClose();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0)
        form.setErrors(error.fieldErrors);
      else
        setFormError(
          error instanceof ApiError ? error.message : "Couldn't save. Please try again.",
        );
    }
  }

  return (
    <WindowFrame
      opened
      onClose={onClose}
      title="Rename Role"
      subtitle={`The key, ${role.key}, stays the same.`}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <div className={formClassName}>
          {formError && <Alert color="red">{formError}</Alert>}
          <TextInput
            label="Name"
            classNames={fieldClassNames}
            data-autofocus
            {...form.getInputProps("name")}
          />
          <Textarea
            label="Description"
            classNames={descriptionClassNames}
            rows={3}
            {...form.getInputProps("description")}
          />
          <RoleFormFooter submitLabel="Save" loading={form.submitting} onCancel={onClose} />
        </div>
      </form>
    </WindowFrame>
  );
}
