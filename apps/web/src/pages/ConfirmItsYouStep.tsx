import { Button, PasswordInput } from "@mantine/core";
import { useState } from "react";
import { ApiError, type ConfirmAnswer } from "../api/client";
import {
  GENERIC_ERROR,
  tooManyAttemptsMessage,
  WRONG_RECOVERY_CODE,
  WRONG_SIGN_IN_CODE,
} from "../api/messages";
import { CODE_LENGTH } from "../auth/CodeEntry";
import { type ConfirmPhase } from "../settings/profileView";
import dialogs from "./DisconnectDialogs.module.css";
import setup from "./TwoStepSetupDialog.module.css";
import { SecondCodeEntry } from "./SecondCodeEntry";
import classes from "./ChangeEmailDialog.module.css";

/**
 * Step 1 of Change email, "Confirm it's you" (39b, 39c): for a sign-in too old to change the email, the password and,
 * with Two-step verification, the second code renew it without signing out. The password is kept while the code is
 * asked for, so Back returns to it filled in. The window sends the answer (`confirm`), so it can stay open until the
 * answer is in, and a right one goes on to send the code.
 */
export function ConfirmItsYouStep({
  phase,
  onPhase,
  recovery,
  onRecovery,
  confirm,
  busy,
  onSignInAgain,
  onBack,
}: {
  phase: ConfirmPhase;
  onPhase: (phase: ConfirmPhase) => void;
  /** Whether the second code is a Recovery code; the title says which. */
  recovery: boolean;
  onRecovery: (recovery: boolean) => void;
  /** Sends the answer; `onError` hears why it was refused. */
  confirm: (answer: ConfirmAnswer, onError: (failure: Error) => void) => void;
  /** The answer, or the code send that follows a right one, is out. */
  busy: boolean;
  /** No password to confirm with (Google or GitHub only): sign in again instead. */
  onSignInAgain: () => void;
  /** Back to the new address, which is kept. */
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  function refused(failure: Error) {
    if (failure instanceof ApiError && failure.code === "no_password") {
      onSignInAgain();
    } else if (failure instanceof ApiError && failure.code === "two_step_required") {
      onPhase("secondCode");
    } else if (failure instanceof ApiError && failure.code === "invalid_two_step_code") {
      setCodeError(recovery ? WRONG_RECOVERY_CODE : WRONG_SIGN_IN_CODE);
      setCode("");
    } else if (failure instanceof ApiError && failure.status === 429) {
      // Too many wrong passwords or codes; the server doesn't say which, and either way the wait is the same.
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
  }

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
          confirm({ password }, refused);
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
          {/* Back, not Cancel: the new address was typed before this step, and may need fixing. */}
          <Button variant="default" onClick={onBack} disabled={busy}>
            Back
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
        confirm(recovery ? { password, recoveryCode } : { password, twoStepCode: code }, refused);
      }}
    >
      <SecondCodeEntry
        recovery={recovery}
        code={code}
        recoveryCode={recoveryCode}
        onCode={(value) => {
          setCode(value);
          setCodeError(null);
        }}
        onRecoveryCode={(value) => {
          setRecoveryCode(value);
          setCodeError(null);
        }}
        onSwitch={switchCode}
        message={codeError}
        wrong={codeError !== null}
        disabled={busy}
        busy={busy}
        labelId="confirm-code-label"
      />
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
