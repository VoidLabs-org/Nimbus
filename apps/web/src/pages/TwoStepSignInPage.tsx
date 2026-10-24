import { Anchor } from "@mantine/core";
import { useState, type SyntheticEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { GENERIC_ERROR, SIGN_IN_TIMED_OUT, tooManyAttemptsIn } from "../api/messages";
import { AuthForm, AuthLayout, AuthSubmit, AuthTextInput } from "../auth/AuthLayout";
import classes from "../auth/AuthLayout.module.css";
import { CodeAlert, CODE_LENGTH, CodePinInput, PinnedSubmit } from "../auth/CodeEntry";
import { useCountdown } from "../auth/countdown";
import { returnToSearch, safeReturnPath } from "../auth/returnPath";
import { useSession } from "../auth/useSession";

/** A Recovery code as the server takes it at most; anything longer is never one. */
const RECOVERY_CODE_MAX = 64;

/**
 * The second step of signing in for a User with Two-step verification (design 32e), after their password or after
 * Google or GitHub (the server's callback sends the browser here): the 6-digit Sign-in
 * code from their authenticator app, or, for a User who lost their phone, one of their Recovery codes. The server
 * holds the pending sign-in (5 minutes, 5 wrong codes of either kind); once it is over the User goes back to the
 * sign-in page, which has the provider buttons as well as the password form. A right code continues to `returnTo`, like the sign-in page.
 */
export default function TwoStepSignInPage() {
  const { signInWithCode } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const backToLogin = { pathname: "/login", search: returnToSearch(searchParams.get("returnTo")) };
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Too many wrong codes for this User in the last hour: the form is off and the wait counts down. It is about the
  // User, not the kind of code, so switching between the two keeps it.
  const [lockSeconds, setLockSeconds] = useCountdown();
  const locked = lockSeconds > 0;
  const ready = useRecoveryCode ? recoveryCode.trim() !== "" : code.length === CODE_LENGTH;

  /** Swaps the code boxes for the Recovery code box, or back; what was typed and said about it goes. */
  function switchTo(recovery: boolean) {
    setUseRecoveryCode(recovery);
    setCode("");
    setRecoveryCode("");
    setCodeMessage(null);
    setFormError(null);
  }

  async function verify(event: SyntheticEvent) {
    event.preventDefault();
    if (!ready || checking || locked) return;
    setChecking(true);
    setCodeMessage(null);
    setFormError(null);
    try {
      await signInWithCode(useRecoveryCode ? { recoveryCode } : { code });
      void navigate(safeReturnPath(searchParams.get("returnTo")), { replace: true });
    } catch (failure) {
      setChecking(false);
      showFailure(failure);
    }
  }

  function showFailure(failure: unknown) {
    if (!(failure instanceof ApiError)) {
      setFormError(GENERIC_ERROR);
    } else if (failure.code === "invalid_code") {
      const left = failure.triesLeft;
      const wrong = useRecoveryCode
        ? "That recovery code isn’t right, or it was used already."
        : "That code isn’t right.";
      setCodeMessage(
        left === null ? wrong : `${wrong} ${left} ${left === 1 ? "try" : "tries"} left.`,
      );
    } else if (failure.code === "sign_in_expired") {
      void navigate(backToLogin, { replace: true, state: { notice: SIGN_IN_TIMED_OUT } });
    } else if (failure.status === 429 && failure.retryAfterSeconds) {
      setLockSeconds(failure.retryAfterSeconds);
    } else if (failure.status === 429) {
      setFormError("Too many attempts. Try again later.");
    } else {
      setFormError(GENERIC_ERROR);
    }
  }

  return (
    <AuthLayout
      title={useRecoveryCode ? "Use a recovery code" : "Two-step verification"}
      subtitle={
        useRecoveryCode
          ? "Enter one of the recovery codes you saved. Each one works once."
          : "Enter the 6-digit code from your authenticator app"
      }
      phoneFill
      gap={22}
    >
      <AuthForm onSubmit={(event) => void verify(event)}>
        {useRecoveryCode ? (
          <AuthTextInput
            label="Recovery code"
            placeholder="xxxx-xxxx"
            // Not "one-time-code": that offers the 6-digit codes from messages and apps, never a Recovery code.
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            maxLength={RECOVERY_CODE_MAX}
            value={recoveryCode}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setRecoveryCode(value);
              if (value !== recoveryCode) setCodeMessage(null);
            }}
            disabled={checking || locked}
            error={codeMessage !== null}
          />
        ) : (
          <CodePinInput
            value={code}
            onChange={(value) => {
              setCode(value);
              // The message is about the code that was sent, not one being typed now.
              if (value !== code) setCodeMessage(null);
            }}
            disabled={checking || locked}
            error={codeMessage !== null}
            ariaLabel="Sign-in code digit"
          />
        )}
        {codeMessage && <CodeAlert marked>{codeMessage}</CodeAlert>}
        {locked && <CodeAlert marked>{tooManyAttemptsIn(lockSeconds)}</CodeAlert>}
        {formError && <CodeAlert>{formError}</CodeAlert>}
        <PinnedSubmit>
          <AuthSubmit loading={checking} disabled={!ready || locked}>
            Verify
          </AuthSubmit>
        </PinnedSubmit>
        <div className={classes.codeLinks}>
          {/* Off while a code is checked, so its answer can't land under the other kind of box. Stays a button, so
              keyboard focus isn't lost. */}
          <Anchor
            component="button"
            type="button"
            onClick={() => {
              if (!checking) switchTo(!useRecoveryCode);
            }}
            aria-disabled={checking}
            c={checking ? "dimmed" : undefined}
          >
            {useRecoveryCode
              ? "Use your authenticator app"
              : "Lost your phone? Use a recovery code"}
          </Anchor>
          <Anchor component={Link} to={backToLogin}>
            Back to sign in
          </Anchor>
        </div>
      </AuthForm>
    </AuthLayout>
  );
}
