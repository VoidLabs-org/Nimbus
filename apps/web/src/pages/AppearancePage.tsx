import { Container, Stack, Text, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ThemePicker } from "@repo/ui/theme-picker";
import { isDesktop } from "../shell/desktop";
import { NavPositionPicker } from "../shell/NavPositionPicker";
import { ThemeTiles } from "../settings/ThemeTiles";
import { BreadcrumbTrail } from "../shell/BreadcrumbTrail";
import { settingsCrumbs } from "../settings/crumbs";

/**
 * Settings → Appearance: pick Paper, Ink, Fog or Slate, and in a browser where the navbar sits. The choices are kept in
 * this browser, or on this computer in the Desktop app, which has no navbar (its Sidebar folds with its button or
 * Ctrl/⌘ \) and only the flat themes, as tiles (ThemeTiles): the glass ones don't suit a window.
 */
export default function AppearancePage() {
  const desktop = isDesktop();
  // The Desktop app has only the flat themes, as tiles; a browser has all four, with System, in the pill picker.
  const copy = desktop
    ? {
        keptIn: "on this computer",
        themes: "",
        hint: "Paper is light and Ink is dark. System follows your computer's light or dark setting.",
      }
    : {
        keptIn: "in this browser",
        themes: " Paper and Ink are flat; Fog and Slate are glass.",
        hint: "Paper and Fog are light; Ink and Slate are dark. System follows your device's light or dark setting, and keeps flat or glass as you last chose.",
      };
  return (
    <Container size="md" px={0} py="xl">
      <Stack gap="lg">
        <BreadcrumbTrail crumbs={settingsCrumbs("Appearance")} />
        <div>
          <Title order={1}>Appearance</Title>
          <Text c="dimmed" mt={6}>
            Choose how Nimbus looks.{copy.themes} Your choice is kept {copy.keptIn}.
          </Text>
        </div>
        <Panel p="lg">
          {/* Left-aligned, so the picker keeps its own width instead of stretching across the panel. */}
          <Stack gap="md" align="flex-start">
            {desktop ? <ThemeTiles /> : <ThemePicker />}
            <Text size="sm" c="dimmed">
              {copy.hint}
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
