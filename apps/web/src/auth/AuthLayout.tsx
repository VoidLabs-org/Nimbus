import { ArrowButton } from "@repo/ui/arrow-button";
import {
  PasswordInput,
  TextInput,
  Title,
  type ButtonProps,
  type PasswordInputProps,
  type TextInputProps,
} from "@mantine/core";
import type { CSSProperties, FormEventHandler, ReactNode } from "react";
import { NimbusLogo } from "../shell/NimbusLogo";
import classes from "./AuthLayout.module.css";

/**
 * The sign-in and register page: the Nimbus panel (logo, the "Backlog / to done, / with a little AI" bars and the
 * tagline) on the left, the heading and the page's form on the right. `gap` (pixels) spaces the right column and
 * the fields of its `AuthForm` alike. An optional `icon` sits above the heading. Below about 900px only the form shows, under a small logo.
 */
export function AuthLayout({
  title,
  subtitle,
  gap,
  icon,
  children,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: ReactNode;
  gap: number;
  children: ReactNode;
}) {
  return (
    <div className={classes.page} style={{ "--auth-gap": `${gap}px` } as CSSProperties}>
      <div className={classes.panel}>
        <div className={classes.brand}>
          <NimbusLogo size={30} />
          nimbus
        </div>
        <div className={classes.bars} aria-hidden>
          <span className={`${classes.bar} ${classes.backlog}`}>Backlog</span>
          <span className={`${classes.bar} ${classes.toDone}`}>to done,</span>
          <span className={`${classes.bar} ${classes.littleAi}`}>with a little AI</span>
        </div>
        <div className={classes.tagline}>Projects, issues, boards and sprints for small teams.</div>
      </div>
      <main className={classes.form}>
        {/* The panel is hidden on narrow screens, so the brand moves above the heading there. */}
        <div className={`${classes.brand} ${classes.compactBrand}`}>
          <NimbusLogo size={24} />
          nimbus
        </div>
        {icon}
        <div>
          <Title order={1} fz={40} lh={1.1}>
            {title}
          </Title>
          <div className={classes.subtitle}>{subtitle}</div>
        </div>
        {children}
      </main>
    </div>
  );
}

const fieldClassNames = {
  wrapper: classes.field,
  input: classes.fieldInput,
  description: classes.fieldNote,
  error: classes.fieldNote,
};
// The hint and any error sit under the field, as in the design.
const fieldOrder: ("label" | "input" | "description" | "error")[] = [
  "label",
  "input",
  "description",
  "error",
];

/** The page's form: its fields and button spaced by the layout's `gap`. */
export function AuthForm({
  onSubmit,
  children,
}: {
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className={classes.stack}>
      {children}
    </form>
  );
}

// The look is fixed: callers can't pass the props that carry it, so they can't replace it by accident.
type FieldLook = "classNames" | "inputWrapperOrder";

/** A pill text field as on the sign-in and register pages. */
export function AuthTextInput(props: Omit<TextInputProps, FieldLook>) {
  return <TextInput classNames={fieldClassNames} inputWrapperOrder={fieldOrder} {...props} />;
}

/** A pill password field as on the sign-in and register pages. */
export function AuthPasswordInput(props: Omit<PasswordInputProps, FieldLook>) {
  return <PasswordInput classNames={fieldClassNames} inputWrapperOrder={fieldOrder} {...props} />;
}

/** The form's primary button: an orange pill with the label on the left and a round arrow on the right. */
export function AuthSubmit({
  className,
  children,
  ...props
}: Omit<ButtonProps, "rightSection" | "justify" | "fullWidth"> & { children: ReactNode }) {
  return (
    <ArrowButton
      type="submit"
      fullWidth
      justify="space-between"
      className={className ? `${classes.submit} ${className}` : classes.submit}
      {...props}
    >
      {children}
    </ArrowButton>
  );
}
