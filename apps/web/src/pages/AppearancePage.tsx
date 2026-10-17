import { Container, Stack, Text, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ThemePicker } from "@repo/ui/theme-picker";
import { NavPositionPicker } from "../shell/NavPositionPicker";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { settingsCrumbs } from "../settings/crumbs";

/** Settings → Appearance: pick Paper, Ink, Fog or Slate. The choice is kept in this browser. */
export default function AppearancePage() {
  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={settingsCrumbs("Appearance")} />
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
        <Panel p="lg">
          <Stack gap="md">
            <div>
              <Title order={2} fz={20}>
                Navbar position
              </Title>
              <Text size="sm" c="dimmed" mt={4}>
                Put the navbar on any edge. Top and bottom keep it horizontal; left and right turn
                it into a narrow rail. Your choice is kept in this browser.
              </Text>
            </div>
            <NavPositionPicker />
          </Stack>
        </Panel>
      </Stack>
    </Container>
  );
}
