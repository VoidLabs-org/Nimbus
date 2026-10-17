import { Group, Stack } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { Bone } from "@repo/ui/skeleton";
import type { OpenedRole } from "./openedRole";
import classes from "./RolePage.module.css";

/**
 * The title, Permission panels with a few rows and the summary, in the shape of the Role page. `opened` says what is
 * known when the Roles list opened the Role: platform roles get two panels, a Role without a description has no
 * description line, a built-in Role has a second tag. Without it (a direct visit) the skeleton is the common shape:
 * one panel, a description, one tag. `tabs` adds the Permissions/People tabs.
 */
export function RoleSkeleton({ opened, tabs = false }: { opened?: OpenedRole; tabs?: boolean }) {
  const panels = opened?.kind === "platform" ? 2 : 1;
  return (
    <Stack gap="lg">
      <div>
        <Bone h={34} w={260} my={4} />
        {(opened?.described ?? true) && <Bone h={16} w={420} maw="100%" mt={14} />}
      </div>
      {tabs && <Bone h={44} w={240} radius="xl" />}
      <div className={classes.layout}>
        <div className={classes.main}>
          {Array.from({ length: panels }, (_, panel) => (
            <Panel key={panel} p={8}>
              <div className={classes.skeletonHeading}>
                <Bone h={13} w={120} />
              </div>
              {[0, 1, 2].map((row) => (
                <div key={row} className={classes.skeletonRow}>
                  <Bone h={22} w={22} circle />
                  <div className={classes.skeletonText}>
                    <Bone h={14} w="55%" />
                    <Bone h={11} w="35%" />
                  </div>
                </div>
              ))}
            </Panel>
          ))}
        </div>
        <Panel p="lg" className={classes.skeletonSummary}>
          <Group gap={6}>
            <Bone h={22} w={90} radius="xl" />
            {opened?.builtIn && <Bone h={22} w={70} radius="xl" />}
          </Group>
          <Bone h={18} w={140} />
          <Bone h={14} w={180} />
          <Bone h={14} w={100} />
          <Bone h={36} radius="xl" />
        </Panel>
      </div>
    </Stack>
  );
}
