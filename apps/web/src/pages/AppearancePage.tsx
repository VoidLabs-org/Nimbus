import { Anchor, Container, Group, Stack, Text, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ThemePicker } from "@repo/ui/theme-picker";
import { Link } from "react-router";
import { UserMenu } from "../auth/UserMenu";

/** Settings → Appearance: pick Paper, Ink, Fog or Slate. The choice is kept in this browser. */
export default function AppearancePage() {
  return (
    <Container size="md" py="xl">
      <Group justify="space-between" mb="md">
        <Anchor component={Link} to="/">
          ← Home
        </Anchor>
        <UserMenu />
      </Group>
      <Stack gap="lg">
        <div>
          <Title order={1}>Appearance</Title>
          <Text c="dimmed" mt={6}>
            Choose how Nimbus looks. Paper and Ink are flat; Fog and Slate are glass. Your choice is
            kept in this browser.
          </Text>
        </div>
        <Panel p="lg">
          <Stack gap="md">
            <div>
              <ThemePicker />
            </div>
            <Text size="sm" c="dimmed">
              Paper is light and Ink is dark. Until you pick one, Nimbus follows your system&apos;s
              light or dark setting.
            </Text>
          </Stack>
        </Panel>
      </Stack>
    </Container>
  );
}
