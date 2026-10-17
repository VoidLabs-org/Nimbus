import { Stack } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { Bone } from "@repo/ui/skeleton";
import classes from "./RolesPage.module.css";

/** The tabs and a few rows, in the shape of RoleList, so the list lands without moving anything. */
export function RoleListSkeleton() {
  return (
    <Stack gap="lg">
      <Bone h={44} w={300} radius="xl" />
      <Panel p={8}>
        <div className={classes.columns}>
          <span>Role</span>
          <span>Held by</span>
          <span>Permissions</span>
          <span />
        </div>
        {[0, 1, 2].map((row) => (
          <div key={row} className={classes.row}>
            <div className={classes.role}>
              <div className={classes.name}>
                <Bone h={16} w={140} my={4} />
              </div>
              <div className={classes.summary}>
                <Bone h={13} w="70%" my={3} />
              </div>
            </div>
            <span className={classes.held}>
              <Bone h={13} w={90} />
            </span>
            <span className={classes.permissions}>
              <Bone h={14} w={100} />
            </span>
            <span className={classes.arrow} />
          </div>
        ))}
      </Panel>
    </Stack>
  );
}
