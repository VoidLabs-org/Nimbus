import {
  Avatar,
  Button,
  Group,
  Menu,
  Modal,
  PasswordInput,
  Stack,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { ApiError } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { displayNameError } from "./displayName";
import { useSession } from "./useSession";

/**
 * The signed-in User's menu: who they are (avatar or initials, and display name), a way to change the
 * display name, set or change their password, Roles & access for those who manage Roles, and sign out. Signing out ends this browser's session only. Once it succeeds, RequireUser
 * sends the User to the sign-in page; this menu doesn't navigate itself.
 */
export function UserMenu() {
  const { user, logout } = useSession();
  const canManageRoles = usePlatformPermissions().includes("access:role:manage");
  const [signingOut, setSigningOut] = useState(false);
  const [editing, setEditing] = useState(false);
  // True while a rename is in flight; the dialog can't be dismissed then, or Cancel would be a lie.
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

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
              {/* Falls back to initials of the name when there is no image, or it fails to load. No referrer:
                  Google's image host refuses some requests that carry one. */}
              <Avatar
                src={user.avatarUrl}
                imageProps={{ referrerPolicy: "no-referrer" }}
                name={user.displayName}
                color="initials"
                size="sm"
              />
              {user.displayName}
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => setEditing(true)}>Change display name</Menu.Item>
          <Menu.Item onClick={() => setChangingPassword(true)}>
            {user.hasPassword ? "Change password" : "Set password"}
          </Menu.Item>
          {canManageRoles && (
            <Menu.Item component={Link} to="/settings/roles">
              Roles & access
            </Menu.Item>
          )}
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
      <Modal
        opened={changingPassword}
        onClose={() => setChangingPassword(false)}
        title={user.hasPassword ? "Change password" : "Set password"}
        closeOnEscape={!savingPassword}
        closeOnClickOutside={!savingPassword}
        withCloseButton={!savingPassword}
      >
        <PasswordForm
          hasPassword={user.hasPassword}
          saving={savingPassword}
          onSavingChange={setSavingPassword}
          onDone={() => setChangingPassword(false)}
        />
      </Modal>
    </>
  );
}

function PasswordForm({
  hasPassword,
  saving,
  onSavingChange,
  onDone,
}: {
  hasPassword: boolean;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onDone: () => void;
}) {
  const { changePassword } = useSession();
  const form = useForm({
    initialValues: { currentPassword: "", newPassword: "" },
    // Mirrors the server's rules; the server stays the authority.
    validate: {
      currentPassword: (value) => (hasPassword && !value ? "Enter your current password" : null),
      newPassword: (value) =>
        value.length < 8 || value.length > 128 ? "Use 8 to 128 characters" : null,
    },
  });

  async function submit({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }) {
    onSavingChange(true);
    try {
      await changePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      notifications.show({
        color: "green",
        message: hasPassword
          ? "Password changed. Your other devices will be signed out shortly."
          : "Password set. You can now sign in with your email and password.",
      });
      onDone();
    } catch (error) {
      if (error instanceof ApiError && !hasPassword && error.fieldErrors.currentPassword) {
        // Another tab set a password first, so this one doesn't know yet and has no field for the current one.
        form.setFieldError(
          "newPassword",
          "This account already has a password. Reload the page, then use Change password.",
        );
      } else if (error instanceof ApiError && error.status === 429) {
        form.setFieldError("currentPassword", tooManyAttemptsMessage(error.retryAfterSeconds));
      } else if (
        error instanceof ApiError &&
        (error.fieldErrors.currentPassword || error.fieldErrors.newPassword)
      ) {
        if (error.fieldErrors.currentPassword) {
          form.setFieldError("currentPassword", error.fieldErrors.currentPassword);
        }
        if (error.fieldErrors.newPassword) {
          form.setFieldError("newPassword", error.fieldErrors.newPassword);
        }
      } else {
        form.setFieldError("newPassword", "Couldn't save your password. Please try again.");
      }
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack>
        {hasPassword && (
          <PasswordInput
            label="Current password"
            autoComplete="current-password"
            data-autofocus
            maxLength={128}
            {...form.getInputProps("currentPassword")}
          />
        )}
        <PasswordInput
          label="New password"
          description="8 to 128 characters"
          autoComplete="new-password"
          data-autofocus={hasPassword ? undefined : true}
          maxLength={128}
          {...form.getInputProps("newPassword")}
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
    validate: { displayName: displayNameError },
  });

  async function submit({ displayName }: { displayName: string }) {
    onSavingChange(true);
    try {
      await updateDisplayName(displayName.trim());
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.displayName) {
        form.setFieldError("displayName", error.fieldErrors.displayName);
      } else if (error instanceof ApiError && error.status === 429) {
        form.setFieldError("displayName", tooManyAttemptsMessage(error.retryAfterSeconds));
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
