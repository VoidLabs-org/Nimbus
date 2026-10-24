import { PinInput, type PinInputProps } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./AuthLayout.module.css";

/** Digits in a Verification code, a Reset code or a Sign-in code. */
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
 * Reset password pages. On a phone they get the 48 x 60 size of designs 31k and 31l. `inWindow` gives the smaller,
 * empty boxes of a dialog (design 32c) instead.
 */
export function CodePinInput({
  inWindow = false,
  ...props
}: Omit<PinInputProps, CodeLook> & { inWindow?: boolean }) {
  return (
    <PinInput
      length={CODE_LENGTH}
      type="number"
      inputMode="numeric"
      oneTimeCode
      autoFocus
      size="lg"
      classNames={{
        root: `${classes.pin} ${inWindow ? classes.windowPin : classes.phonePin}`,
        pinInput: classes.pinInput,
      }}
      {...(inWindow ? { placeholder: "" } : {})}
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

/** A red message under a code form; those about the code itself carry the "!" mark. */
export function CodeAlert({ marked, children }: { marked?: boolean; children: ReactNode }) {
  return (
    <div className={classes.codeError} role="alert">
      {marked && (
        <span className={classes.codeErrorMark} aria-hidden>
          !
        </span>
      )}
      {children}
    </div>
  );
}
