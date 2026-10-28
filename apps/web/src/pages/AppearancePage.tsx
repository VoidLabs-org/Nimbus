import { Container, Stack, Text, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ThemePicker } from "@repo/ui/theme-picker";
import { isDesktop } from "../shell/desktop";
import { NavPositionPicker } from "../shell/NavPositionPicker";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { settingsCrumbs } from "../settings/crumbs";

/**
 * Settings → Appearance: pick Paper, Ink, Fog or Slate, and in a browser where the navbar sits. The choices are kept in
 * this browser, or on this computer in the Desktop app, which has no navbar (its Sidebar folds with its button or
 * Ctrl/⌘ \).
 */
export default function AppearancePage() {
  const desktop = isDesktop();
  const keptIn = desktop ? "on this computer" : "in this browser";
  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={settingsCrumbs("Appearance")} />
        <div>
          <Title order={1}>Appearance</Title>
          <Text c="dimmed" mt={6}>
            Choose how Nimbus looks. Paper and Ink are flat; Fog and Slate are glass. Your choice is
            kept {keptIn}.
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
        {!desktop && (
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
        )}
      </Stack>
    </Container>
  );
}
