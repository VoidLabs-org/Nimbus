import classes from "./NewRoleModal.module.css";

/** Class names of the Role windows' fields, from the "Nimbus Themes" design (14a). */
export const fieldClassNames = {
  wrapper: classes.field,
  input: classes.fieldInput,
  label: classes.label,
};

/** The multi-line description field's class names. */
export const descriptionClassNames = { label: classes.label, input: classes.description };

/** The form inside a Role window: its fields in a column, tighter when the window is short. */
export const formClassName = classes.form;
