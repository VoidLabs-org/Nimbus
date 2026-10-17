import { Panel } from "@repo/ui/panel";
import { Bone } from "@repo/ui/skeleton";
import classes from "./AuditLogPage.module.css";

/** A day heading and a few rows, in the shape of the log, so the entries land without moving anything. */
export function AuditLogSkeleton() {
  return (
    <Panel p={8}>
      <div className={classes.day}>
        <Bone h={11} w={80} />
      </div>
      <div className={classes.list}>
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className={classes.row} data-skeleton>
            <span className={classes.time}>
              <Bone h={13} w={44} />
            </span>
            <span className={classes.who}>
              <Bone h={28} w={28} circle />
              <Bone h={14} w={110} />
            </span>
            <div className={classes.what}>
              <Bone h={14} w="65%" />
              <div className={classes.chips}>
                <Bone h={25} w={110} radius="xl" />
                <Bone h={25} w={90} radius="xl" />
              </div>
            </div>
            <Bone h={27} w={100} radius="xl" className={classes.roleBone} />
            <span className={classes.arrow} />
          </div>
        ))}
      </div>
    </Panel>
  );
}
