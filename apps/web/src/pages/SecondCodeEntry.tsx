import { Anchor, TextInput } from "@mantine/core";
import { CodePinInput } from "../auth/CodeEntry";
import { recoveryCodeInputProps } from "../auth/recoveryCode";
import classes from "./TwoStepSetupDialog.module.css";

/**
 * The second code in a window that asks for one (Remove two-step verification, Confirm it's you): six boxes for the
 * Sign-in code from the authenticator app, or a Recovery code box for a User who lost their phone, with the switch
 * between them and the message about what was typed. The caller keeps what was typed and decides what is said.
 */
export function SecondCodeEntry({
  recovery,
  code,
  recoveryCode,
  onCode,
  onRecoveryCode,
  onSwitch,
  message,
  wrong,
  disabled,
  busy,
  labelId,
}: {
  /** Whether the Recovery code box shows instead of the six boxes. */
  recovery: boolean;
  code: string;
  recoveryCode: string;
  onCode: (code: string) => void;
  onRecoveryCode: (recoveryCode: string) => void;
  /** Swaps the two; the caller clears what was typed and said about it. */
  onSwitch: () => void;
  /** Shown under the box as an alert: the code was wrong, or the wait. */
  message: string | null;
  /** Marks the box red. */
  wrong: boolean;
  disabled: boolean;
  /** A code is being checked: the switch is off, so its answer can't land under the other kind of box. */
  busy: boolean;
  /** Unique in the page, for the label of the six boxes. */
  labelId: string;
}) {
  return (
    <div>
      {recovery ? (
        <TextInput
          {...recoveryCodeInputProps}
          data-autofocus
          value={recoveryCode}
          onChange={(event) => onRecoveryCode(event.currentTarget.value)}
          disabled={disabled}
          error={wrong}
        />
      ) : (
        <>
          <span className={classes.label} id={labelId}>
            Enter the 6-digit code from the app
          </span>
          <CodePinInput
            value={code}
            onChange={onCode}
            disabled={disabled}
            error={wrong}
            inWindow
            aria-labelledby={labelId}
          />
        </>
      )}
      {message && (
        <div className={classes.error} role="alert">
          {message}
        </div>
      )}
      <Anchor
        component="button"
        type="button"
        className={classes.switchCode}
        onClick={() => {
          if (!busy) onSwitch();
        }}
        aria-disabled={busy}
        c={busy ? "dimmed" : undefined}
      >
        {recovery ? "Use your authenticator app" : "Use a recovery code"}
      </Anchor>
    </div>
  );
}
