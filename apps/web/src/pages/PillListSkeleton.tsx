import { Bone } from "@repo/ui/skeleton";
import classes from "./PillListSkeleton.module.css";

/** A few pill rows (a badge, a name and a line under it), for a list of pills while it loads. */
export function PillListSkeleton() {
  return (
    <div className={classes.list}>
      {[0, 1, 2].map((row) => (
        <div key={row} className={classes.row}>
          <span className={classes.badge} />
          <div className={classes.text}>
            <Bone h={17} w={160} my={4} />
            <Bone h={14} w="50%" my={3} />
          </div>
        </div>
      ))}
    </div>
  );
}
