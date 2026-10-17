import { Button, Container, Group, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { toast } from "@repo/ui/toast";
import { ApiError } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { passwordError } from "../auth/password";
import { useSession } from "../auth/useSession";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { settingsCrumbs } from "../settings/crumbs";

/**
 * Settings → Password: set a password (a User who signed in with Google or GitHub has none) or change it. Changing
 * needs the current one. The rules are the server's; this mirrors them so most mistakes are caught before sending.
 */
export default function PasswordPage() {
  const { user, changePassword } = useSession();
  const hasPassword = user?.hasPassword ?? false;
  const form = useForm({
    initialValues: { currentPassword: "", newPassword: "" },
    validate: {
      currentPassword: (value) => (hasPassword && !value ? "Enter your current password" : null),
      newPassword: passwordError,
    },
  });

  if (!user) return null;

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
        hasPassword
          ? "Password changed. Your other devices will be signed out shortly."
          : "Password set. You can now sign in with your email and password.",
      );
      form.reset();
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
    }
  }

  return (
    <Container size="sm" px={0} py="xl">
      <Stack gap="lg" maw={520}>
        <BreadcrumbTrail crumbs={settingsCrumbs("Password")} />
        <div>
          <Title order={1} fz={32} lh={1.1}>
            Password
          </Title>
          <Text c="var(--color-accent-2-700)" mt={6}>
            {hasPassword
              ? "Change the password you sign in with."
              : "Set a password to sign in with your email as well."}
          </Text>
        </div>
        <form onSubmit={form.onSubmit(submit)}>
          <Stack gap="md">
            {hasPassword && (
              <PasswordInput
                label="Current password"
                autoComplete="current-password"
                maxLength={128}
                {...form.getInputProps("currentPassword")}
              />
            )}
            <PasswordInput
              label="New password"
              description="8 to 128 characters"
              autoComplete="new-password"
              maxLength={128}
              {...form.getInputProps("newPassword")}
            />
            <Group>
              <Button type="submit" loading={form.submitting}>
                {hasPassword ? "Change password" : "Set password"}
              </Button>
              <Button
                variant="default"
                disabled={!form.isDirty() || form.submitting}
                onClick={() => form.reset()}
              >
                Cancel
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
