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
          {/* Left-aligned, so the picker keeps its own width instead of stretching across the panel. */}
          <Stack gap="md" align="flex-start">
            <ThemePicker />
            <Text size="sm" c="dimmed">
              Paper and Fog are light; Ink and Slate are dark. System follows your device&apos;s
              light or dark setting, and keeps flat or glass as you last chose.
            </Text>
          </Stack>
        </Panel>
      </Stack>
    </Container>
  );
}
