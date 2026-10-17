import { Avatar, Button, Container, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { ApiError } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { displayNameError } from "../auth/displayName";
import { useSession } from "../auth/useSession";

/** Settings → Profile: the User's avatar, name and email, and a Display name they can change. */
export default function ProfilePage() {
  const { user } = useSession();
  if (!user) return null;

  return (
    <Container size="sm" px={0} py="xl">
      <Stack gap="lg" maw={520}>
        <div>
          <Title order={1} fz={32} lh={1.1}>
            Profile
          </Title>
          <Text c="var(--color-accent-2-700)" mt={6}>
            How you appear to your team.
          </Text>
        </div>
        <Group gap="md" wrap="nowrap">
          {/* Falls back to initials when there is no image, or it fails to load. No referrer: Google's image host
              refuses some requests that carry one. */}
          <Avatar
            src={user.avatarUrl}
            imageProps={{ referrerPolicy: "no-referrer" }}
            name={user.displayName}
            color="initials"
            size={64}
          />
          <div>
            <Text fw={600}>{user.displayName}</Text>
            <Text size="sm" c="var(--color-accent-2-700)">
              {user.email}
            </Text>
          </div>
        </Group>
        {/* Keyed by the saved name, so the field starts again from it after a save (or if it changed elsewhere). */}
        <DisplayNameForm key={user.displayName} current={user.displayName} />
      </Stack>
    </Container>
  );
}

function DisplayNameForm({ current }: { current: string }) {
  const { updateDisplayName } = useSession();
  const form = useForm({
    initialValues: { displayName: current },
    validate: { displayName: displayNameError },
  });

  async function submit({ displayName }: { displayName: string }) {
    try {
      await updateDisplayName(displayName.trim());
      notifications.show({ message: "Display name saved." });
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.displayName) {
        form.setFieldError("displayName", error.fieldErrors.displayName);
      } else if (error instanceof ApiError && error.status === 429) {
        form.setFieldError("displayName", tooManyAttemptsMessage(error.retryAfterSeconds));
      } else {
        form.setFieldError("displayName", "Couldn't save your name. Please try again.");
      }
    }
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="md">
        <TextInput
          label="Display name"
          autoComplete="name"
          {...form.getInputProps("displayName")}
        />
        <Group>
          <Button type="submit" loading={form.submitting} disabled={!form.isDirty()}>
            Save changes
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
  );
}
