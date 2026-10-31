import { Panel } from "@repo/ui/panel";
import { Bone } from "@repo/ui/skeleton";
import classes from "./ProjectsPage.module.css";

/** A few rows, in the shape of the project list, so the list lands without moving anything. */
export function ProjectListSkeleton() {
  return (
    <Panel p={8}>
      <div className={classes.skeleton}>
        {[0, 1, 2].map((row) => (
          <div key={row} className={classes.row}>
            <div className={classes.project}>
              <div className={classes.name}>
                <Bone h={16} w={160} my={4} />
              </div>
              <div className={classes.summary}>
                <Bone h={13} w="70%" my={3} />
              </div>
            </div>
            <span className={classes.arrow} />
          </div>
        ))}
      </div>
    </Panel>
  );
}
