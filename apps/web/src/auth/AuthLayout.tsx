import {
  Button,
  PasswordInput,
  TextInput,
  Title,
  type ButtonProps,
  type PasswordInputProps,
  type TextInputProps,
} from "@mantine/core";
import { useNimbusTheme } from "@repo/ui/nimbus-theme";
import type { ReactNode } from "react";
import classes from "./AuthLayout.module.css";

/**
 * The sign-in and register page: the Nimbus panel (logo, the "Backlog / to done, / with a little AI" bars and the
 * tagline) on the left, the heading and the page's form on the right, `gap` pixels apart. Below about 900px only
 * the form shows.
 */
export function AuthLayout({
  title,
  subtitle,
  gap,
  children,
}: {
  title: string;
  subtitle: string;
  gap: number;
  children: ReactNode;
}) {
  const { mode } = useNimbusTheme();

  return (
    <div className={classes.page}>
      <div className={classes.panel}>
        <div className={classes.brand}>
          {/* The light logo has dark bars for light themes; the dark one cream bars for dark themes. */}
          <img
            src={mode === "dark" ? "/nimbus-icon-dark.png" : "/nimbus-icon-light.png"}
            alt=""
            width={30}
            height={30}
          />
          nimbus
        </div>
        <div className={classes.bars} aria-hidden>
          <span className={`${classes.bar} ${classes.backlog}`}>Backlog</span>
          <span className={`${classes.bar} ${classes.toDone}`}>to done,</span>
          <span className={`${classes.bar} ${classes.littleAi}`}>with a little AI</span>
        </div>
        <div className={classes.tagline}>Projects, issues, boards and sprints for small teams.</div>
      </div>
      <main className={classes.form} style={{ gap }}>
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

/** A pill text field as on the sign-in and register pages. */
export function AuthTextInput(props: TextInputProps) {
  return <TextInput classNames={fieldClassNames} inputWrapperOrder={fieldOrder} {...props} />;
}

/** A pill password field as on the sign-in and register pages. */
export function AuthPasswordInput(props: PasswordInputProps) {
  return <PasswordInput classNames={fieldClassNames} inputWrapperOrder={fieldOrder} {...props} />;
}

/** The form's primary button: an orange pill with the label on the left and a round arrow on the right. */
export function AuthSubmit({ children, ...props }: ButtonProps & { children: ReactNode }) {
  return (
    <Button
      type="submit"
      fullWidth
      justify="space-between"
      className={classes.submit}
      rightSection={
        <span className={classes.arrow} aria-hidden>
          →
        </span>
      }
      {...props}
    >
      {children}
    </Button>
  );
}
