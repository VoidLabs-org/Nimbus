import {
  Avatar,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { ApiError } from "../api/client";
import { useSession } from "./useSession";

/**
 * The signed-in User's menu: who they are (avatar or initials, and display name), a way to change the
 * display name, and sign out. Signing out ends this browser's session only. Once it succeeds, RequireUser
 * sends the User to the sign-in page; this menu doesn't navigate itself.
 */
export function UserMenu() {
  const { user, logout } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [editing, setEditing] = useState(false);
  // True while a rename is in flight; the dialog can't be dismissed then, or Cancel would be a lie.
  const [saving, setSaving] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      notifications.show({
        color: "red",
        message: "Couldn't sign out. Check your connection and try again.",
      });
      setSigningOut(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <UnstyledButton>
            <Group gap="xs">
              {/* Falls back to initials of the name when there is no image. */}
              <Avatar src={user.avatarUrl} name={user.displayName} color="initials" size="sm" />
              {user.displayName}
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => setEditing(true)}>Change display name</Menu.Item>
          <Menu.Item onClick={signOut} disabled={signingOut}>
            Sign out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal
        opened={editing}
        onClose={() => setEditing(false)}
        title="Change display name"
        closeOnEscape={!saving}
        closeOnClickOutside={!saving}
        withCloseButton={!saving}
      >
        <DisplayNameForm
          current={user.displayName}
          saving={saving}
          onSavingChange={setSaving}
          onDone={() => setEditing(false)}
        />
      </Modal>
    </>
  );
}

function DisplayNameForm({
  current,
  saving,
  onSavingChange,
  onDone,
}: {
  current: string;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}) {
  const { updateDisplayName } = useSession();
  const form = useForm({
    initialValues: { displayName: current },
    // Mirrors the server's rule; the server stays the authority.
    validate: { displayName: (value) => (value.trim() ? null : "Enter your name") },
  });

  async function submit({ displayName }: { displayName: string }) {
    onSavingChange(true);
    try {
      await updateDisplayName(displayName.trim());
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.displayName) {
        form.setFieldError("displayName", error.fieldErrors.displayName);
      } else {
        form.setFieldError("displayName", "Couldn't save your name. Please try again.");
      }
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack>
        <TextInput
          label="Name"
          autoComplete="name"
          data-autofocus
          maxLength={100}
          {...form.getInputProps("displayName")}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
