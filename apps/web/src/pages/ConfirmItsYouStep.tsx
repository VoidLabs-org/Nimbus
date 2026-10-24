import { Anchor, Button, PasswordInput, TextInput } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, type ConfirmAnswer } from "../api/client";
import {
  GENERIC_ERROR,
  tooManyAttemptsMessage,
  WRONG_RECOVERY_CODE,
  WRONG_SIGN_IN_CODE,
} from "../api/messages";
import { CODE_LENGTH, CodePinInput } from "../auth/CodeEntry";
import { recoveryCodeInputProps } from "../auth/recoveryCode";
import dialogs from "./DisconnectDialogs.module.css";
import setup from "./TwoStepSetupDialog.module.css";
import { type ConfirmPhase } from "../settings/profileView";
import classes from "./ChangeEmailDialog.module.css";

/**
 * Step 1 of Change email, "Confirm it's you" (39b, 39c): for a sign-in too old to change the email, the password and,
 * with Two-step verification, the second code renew it without signing out. The password is kept while the code is
 * asked for, so Back returns to it filled in.
 */
export function ConfirmItsYouStep({
  phase,
  onPhase,
  recovery,
  onRecovery,
  sending,
  onConfirmed,
  onSignInAgain,
  onCancel,
}: {
  phase: ConfirmPhase;
  onPhase: (phase: ConfirmPhase) => void;
  /** Whether the second code is a Recovery code; the title says which. */
  recovery: boolean;
  onRecovery: (recovery: boolean) => void;
  /** The code to the new address is being sent, which follows a right answer. */
  sending: boolean;
  onConfirmed: () => void;
  /** No password to confirm with (Google or GitHub only): sign in again instead. */
  onSignInAgain: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const confirm = useMutation({
    mutationFn: (answer: ConfirmAnswer) => api.confirmItsYou(answer),
    onSuccess: onConfirmed,
    onError: (failure) => {
      if (failure instanceof ApiError && failure.code === "no_password") {
        onSignInAgain();
      } else if (failure instanceof ApiError && failure.code === "two_step_required") {
        onPhase("secondCode");
      } else if (failure instanceof ApiError && failure.code === "invalid_two_step_code") {
        setCodeError(recovery ? WRONG_RECOVERY_CODE : WRONG_SIGN_IN_CODE);
        setCode("");
      } else if (failure instanceof ApiError && failure.status === 429) {
        const message = tooManyAttemptsMessage(failure.retryAfterSeconds);
        if (phase === "password") setPasswordError(message);
        else setCodeError(message);
      } else if (failure instanceof ApiError && failure.fieldErrors.password) {
        setPasswordError("That password isn’t right.");
        onPhase("password");
      } else if (phase === "password") {
        setPasswordError(GENERIC_ERROR);
      } else {
        setCodeError(GENERIC_ERROR);
      }
    },
  });
  const busy = confirm.isPending || sending;

  /** Swaps the code boxes for the Recovery code box, or back; what was typed and said about it goes. */
  function switchCode() {
    onRecovery(!recovery);
    setCode("");
    setRecoveryCode("");
    setCodeError(null);
  }

  if (phase === "password") {
    return (
      <form
        className={`${setup.body} ${classes.body}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (password === "" || busy) return;
          confirm.mutate({ password });
        }}
      >
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          maxLength={128}
          data-autofocus
          value={password}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
            setPasswordError(null);
          }}
          error={passwordError}
          disabled={busy}
        />
        <div className={dialogs.footer}>
          <Button variant="default" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={password === ""}>
            Continue
          </Button>
        </div>
      </form>
    );
  }

  const ready = recovery ? recoveryCode.trim() !== "" : code.length === CODE_LENGTH;
  return (
    <form
      className={`${setup.body} ${classes.body}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || busy || codeError !== null) return;
        confirm.mutate(recovery ? { password, recoveryCode } : { password, twoStepCode: code });
      }}
    >
      <div>
        {recovery ? (
          <TextInput
            {...recoveryCodeInputProps}
            data-autofocus
            value={recoveryCode}
            onChange={(event) => {
              setRecoveryCode(event.currentTarget.value);
              setCodeError(null);
            }}
            disabled={busy}
            error={codeError !== null}
          />
        ) : (
          <>
            <span className={setup.label} id="confirm-code-label">
              Enter the 6-digit code from the app
            </span>
            <CodePinInput
              value={code}
              onChange={(value) => {
                setCode(value);
                setCodeError(null);
              }}
              disabled={busy}
              error={codeError !== null}
              inWindow
              aria-labelledby="confirm-code-label"
            />
          </>
        )}
        {codeError && (
          <div className={classes.error} role="alert">
            {codeError}
          </div>
        )}
        {/* Off while a code is checked, so its answer can't land under the other kind of box. */}
        <Anchor
          component="button"
          type="button"
          className={setup.switchCode}
          onClick={() => {
            if (!busy) switchCode();
          }}
          aria-disabled={busy}
          c={busy ? "dimmed" : undefined}
        >
          {recovery ? "Use your authenticator app" : "Use a recovery code"}
        </Anchor>
      </div>
      <div className={dialogs.footer}>
        <Button
          variant="default"
          onClick={() => {
            setCodeError(null);
            onPhase("password");
          }}
          disabled={busy}
        >
          Back
        </Button>
        <Button type="submit" loading={busy} disabled={!ready || codeError !== null}>
          Continue
        </Button>
      </div>
    </form>
  );
}
