import { Bone } from "@repo/ui/skeleton";
import classes from "./ProjectsPage.module.css";

/** A few rows, in the shape of the project list, so the list lands without moving anything. */
export function ProjectListSkeleton() {
  return (
    <div className={classes.list}>
      {[0, 1, 2].map((row) => (
        <div key={row} className={classes.row}>
          <span className={classes.badgeBone} />
          <div className={classes.project}>
            <div className={classes.name}>
              <Bone h={17} w={160} my={4} />
            </div>
            <div className={classes.summary}>
              <Bone h={14} w="50%" my={3} />
            </div>
          </div>
          <span className={classes.arrow} />
        </div>
      ))}
    </div>
  );
}
