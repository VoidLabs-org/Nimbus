import { Kbd, Stack, Text, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { PillTabs } from "@repo/ui/pill-tabs";
import { desktopPlatform, modifierLabel } from "./desktop";
import { AUTO_FOLD_QUERY, parseSidebarState, useSidebarState } from "./sidebarState";

/**
 * The Desktop app's Sidebar setting on the Appearance page, in place of the browser's navbar position: Open or Folded,
 * the same choice as the fold button and its shortcut. Under 960px wide the Sidebar folds itself, which the note says.
 */
export function SidebarPicker() {
  const platform = desktopPlatform();
  const [state, setState] = useSidebarState();
  const narrow = useMediaQuery(AUTO_FOLD_QUERY, false, { getInitialValueInEffect: false });
  return (
    <Stack gap="md" align="flex-start">
      <div>
        <Title order={2} fz={20}>
          Sidebar
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          Open shows each page by name; folded keeps a narrow rail of icons.{" "}
          <Kbd>{modifierLabel(platform)}</Kbd> + <Kbd>\</Kbd> switches between them. Your choice is
          kept on this computer.
        </Text>
      </div>
      <PillTabs
        aria-label="Sidebar"
        value={state}
        onChange={(value) => setState(parseSidebarState(value))}
        data={[
          { value: "open", label: "Open" },
          { value: "folded", label: "Folded" },
        ]}
      />
      {narrow && (
        <Text size="sm" c="dimmed">
          While the window is less than 960 pixels wide, the Sidebar folds itself, whichever you
          choose.
        </Text>
      )}
    </Stack>
  );
}
