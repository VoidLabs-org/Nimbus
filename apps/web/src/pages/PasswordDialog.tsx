import { IconInfoCircle } from "@tabler/icons-react";
import { Button, PasswordInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { toast } from "@repo/ui/toast";
import { WindowFrame } from "../access/WindowFrame";
import { ApiError } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { passwordError } from "../auth/password";
import { useSession } from "../auth/useSession";
import dialogs from "./DisconnectDialogs.module.css";
import email from "./ChangeEmailDialog.module.css";

/**
 * Change password and Set a password on Profile (designs 39m–39o). Changing needs the current password and signs
 * every other device out; setting a first one (a User who signs in only with Google or GitHub) needs none and keeps
 * the provider connected. The rules are the server's; this mirrors them so most mistakes are caught before sending.
 */
export function PasswordDialog({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { user } = useSession();
  const hasPassword = user?.hasPassword ?? false;
  return (
    <WindowFrame
      opened={opened}
      onClose={onClose}
      title={hasPassword ? "Change password" : "Set a password"}
      subtitle={
        hasPassword
          ? "Use 8 to 128 characters."
          : "Then you can sign in with your email as well as Google or GitHub."
      }
    >
      {/* Inside the window, so each time it opens the form starts empty. */}
      <PasswordForm hasPassword={hasPassword} onDone={onClose} />
    </WindowFrame>
  );
}

function PasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => void }) {
  const { changePassword } = useSession();
  const form = useForm({
    initialValues: { currentPassword: "", newPassword: "" },
    validate: {
      currentPassword: (value) => (hasPassword && !value ? "Enter your current password" : null),
      newPassword: passwordError,
    },
  });

  async function submit({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }) {
    try {
      await changePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      toast.success(
        hasPassword ? "Password updated. Other devices were signed out." : "Password set.",
      );
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
          form.setFieldError("currentPassword", "That password isn’t right.");
        }
        if (error.fieldErrors.newPassword) {
          form.setFieldError("newPassword", error.fieldErrors.newPassword);
        }
      } else {
        form.setFieldError("newPassword", "Couldn't save your password. Please try again.");
      }
    }
  }

  return (
    <form className={email.body} onSubmit={form.onSubmit(submit)}>
      {hasPassword && (
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          maxLength={128}
          data-autofocus
          {...form.getInputProps("currentPassword")}
        />
      )}
      <PasswordInput
        label="New password"
        description="8 to 128 characters"
        autoComplete="new-password"
        maxLength={128}
        data-autofocus={!hasPassword || undefined}
        {...form.getInputProps("newPassword")}
      />
      {!hasPassword && (
        <div className={email.note}>
          <IconInfoCircle size={18} className={email.noteMark} aria-hidden />
          Google and GitHub stay connected.
        </div>
      )}
      <div className={dialogs.footer}>
        <Button variant="default" onClick={onDone} disabled={form.submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={form.submitting}>
          {hasPassword ? "Update password" : "Set password"}
        </Button>
      </div>
    </form>
  );
}
