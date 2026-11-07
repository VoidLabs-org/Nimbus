import { Bone } from "@repo/ui/skeleton";
import classes from "./ProjectsPage.module.css";

/** A few rows, in the shape of the projects table, so the table lands without moving anything. */
export function ProjectListSkeleton() {
  return (
    <div className={classes.tableFrame}>
      <table className={classes.table} aria-hidden>
        <thead>
          <tr>
            <th className={classes.keyCell}>
              <Bone h={10} w={24} />
            </th>
            <th>
              <Bone h={10} w={40} />
            </th>
            <th className={classes.wideOnly} />
            <th className={classes.numberCell} />
            <th className={classes.wideOnly} />
            <th className={classes.wideOnly} />
            <th className={classes.wideOnly} />
            <th />
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((row) => (
            <tr key={row}>
              <td className={classes.keyCell}>
                <Bone h={10} w={28} />
              </td>
              <td>
                <div className={classes.project}>
                  <span className={classes.badgeBone} />
                  <div className={classes.projectText}>
                    <Bone h={14} w={160} my={2} />
                    <Bone h={11} w={220} my={2} />
                  </div>
                </div>
              </td>
              <td className={classes.wideOnly}>
                <span className={classes.bone} />
              </td>
              <td className={classes.numberCell}>
                <span className={classes.bone} />
              </td>
              <td className={classes.wideOnly}>
                <span className={classes.bone} />
              </td>
              <td className={classes.wideOnly}>
                <span className={classes.bone} />
              </td>
              <td className={classes.wideOnly}>
                <span className={classes.bone} />
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
