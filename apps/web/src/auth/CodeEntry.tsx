import { PinInput, type PinInputProps } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./AuthLayout.module.css";

/** Digits in a Verification code or a Reset code. */
export const CODE_LENGTH = 6;

// The look and the code's rules are fixed: callers can't pass the props that carry them.
type CodeLook =
  | "length"
  | "type"
  | "inputMode"
  | "oneTimeCode"
  | "autoFocus"
  | "size"
  | "classNames";

/**
 * The six boxes for an emailed code (digits only, paste fills all, one-time-code autofill), as on the Verify and
 * Reset password pages. On a phone they get the 48 x 60 size of designs 31k and 31l.
 */
export function CodePinInput(props: Omit<PinInputProps, CodeLook>) {
  return (
    <PinInput
      length={CODE_LENGTH}
      type="number"
      inputMode="numeric"
      oneTimeCode
      autoFocus
      size="lg"
      classNames={{ root: `${classes.pin} ${classes.phonePin}`, pinInput: classes.pinInput }}
      {...props}
    />
  );
}

/**
 * Wraps the page's button. Inside an `AuthLayout` with `phoneFill` it sits at the bottom of a phone's screen,
 * above the keyboard; anywhere else it is just the button.
 */
export function PinnedSubmit({ children }: { children: ReactNode }) {
  return <div className={classes.pinnedSubmit}>{children}</div>;
}
