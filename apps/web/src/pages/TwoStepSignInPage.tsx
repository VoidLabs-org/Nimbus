import { Anchor } from "@mantine/core";
import { useState, type SyntheticEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { GENERIC_ERROR, SIGN_IN_TIMED_OUT, tooManyAttemptsIn } from "../api/messages";
import { AuthForm, AuthLayout, AuthSubmit } from "../auth/AuthLayout";
import classes from "../auth/AuthLayout.module.css";
import { CodeAlert, CODE_LENGTH, CodePinInput, PinnedSubmit } from "../auth/CodeEntry";
import { useCountdown } from "../auth/countdown";
import { returnToSearch, safeReturnPath } from "../auth/returnPath";
import { useSession } from "../auth/useSession";

/**
 * The second step of a password sign-in for a User with Two-step verification (design 32e): the 6-digit Sign-in
 * code from their authenticator app. The server holds the pending sign-in (5 minutes, 5 wrong codes); once it is
 * over the User goes back to the sign-in page. A right code continues to `returnTo`, like the sign-in page.
 */
export default function TwoStepSignInPage() {
  const { signInWithCode } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const backToLogin = { pathname: "/login", search: returnToSearch(searchParams.get("returnTo")) };
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Too many wrong codes for this User in the last hour: the boxes are off and the wait counts down.
  const [lockSeconds, setLockSeconds] = useCountdown();
  const locked = lockSeconds > 0;

  async function verify(event: SyntheticEvent) {
    event.preventDefault();
    if (code.length < CODE_LENGTH || checking || locked) return;
    setChecking(true);
    setCodeMessage(null);
    setFormError(null);
    try {
      await signInWithCode(code);
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
      setCodeMessage(
        left === null
          ? "That code isn’t right."
          : `That code isn’t right. ${left} ${left === 1 ? "try" : "tries"} left.`,
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
      title="Two-step verification"
      subtitle="Enter the 6-digit code from your authenticator app"
      phoneFill
      gap={22}
    >
      <AuthForm onSubmit={(event) => void verify(event)}>
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
        {codeMessage && <CodeAlert marked>{codeMessage}</CodeAlert>}
        {locked && <CodeAlert marked>{tooManyAttemptsIn(lockSeconds)}</CodeAlert>}
        {formError && <CodeAlert>{formError}</CodeAlert>}
        <PinnedSubmit>
          <AuthSubmit loading={checking} disabled={code.length < CODE_LENGTH || locked}>
            Verify
          </AuthSubmit>
        </PinnedSubmit>
        <div className={classes.codeLinks}>
          <Anchor component={Link} to={backToLogin}>
            Back to sign in
          </Anchor>
        </div>
      </AuthForm>
    </AuthLayout>
  );
}
