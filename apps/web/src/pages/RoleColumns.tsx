import classes from "./RolesPage.module.css";

/** The Roles list's column titles, shared with its skeleton so they stay in step. Only visual: the list says "Held by" itself. */
export function RoleColumns() {
  return (
    <div className={classes.columns} aria-hidden>
      <span>Role</span>
      <span>Held by</span>
      <span>Permissions</span>
      <span />
    </div>
  );
}
