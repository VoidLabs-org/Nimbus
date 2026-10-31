import { Anchor, Loader, VisuallyHidden } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type CSSProperties } from "react";
import { api, ApiError } from "../api/client";
import { clock, tooManyAttemptsMessage } from "@repo/api";
import { AuthForm, AuthLayout, AuthSubmit } from "./AuthLayout";
import { CODE_LENGTH, CodePinInput, PinnedSubmit } from "./CodeEntry";
import classes from "./AuthLayout.module.css";
import { RESEND_WAIT_SECONDS, useCountdown } from "./countdown";
import { useSession } from "./useSession";

/** How long "Email verified" stays up before the app opens (the progress bar fills over this time). */
const CONFIRM_MS = 1500;

/** What to tell the User when the server refused their code. */
function verificationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "invalid_code") {
      const left = error.triesLeft;
      return left === null
        ? "That code isn’t right."
        : `That code isn’t right. ${left} ${left === 1 ? "try" : "tries"} left.`;
    }
    if (error.code === "code_expired") {
      return "That code has expired, or was cancelled after too many wrong tries.";
    }
    if (error.status === 429) return tooManyAttemptsMessage(error.retryAfterSeconds);
  }
  return "Something went wrong. Please try again.";
}

/**
 * What a signed-in User sees, in place of the whole app, until they enter the Verification code emailed to
 * them. The code goes in six boxes that submit by themselves after the last digit (a pasted code fills them
 * all). Resend mails a new code, then waits (60 seconds, or the server's Retry-After) before it works again. A
 * correct code first shows "Email verified" for a moment, then opens the app at the address they were on.
 * "Use a different email" signs out, which is the way out of a typo.
 */
export function VerifyEmailScreen() {
  const { user, verifyEmail, finishVerifying, logout, retry } = useSession();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The boxes go red only when the message is about the code itself.
  const [codeRejected, setCodeRejected] = useState(false);
  // Said after a new code is sent, so the press is seen to have worked.
  const [notice, setNotice] = useState<string | null>(null);
  const resendCode = useMutation({ mutationFn: () => api.resendVerificationCode() });
  const resending = resendCode.isPending;
  const [secondsToResend, setSecondsToResend] = useCountdown();
  const verified = user?.emailVerified === true;
  const waiting = secondsToResend > 0;
  // The confirmation goes with the countdown: a minute on, it is no longer news.
  const shownNotice = waiting ? notice : null;

  useEffect(() => {
    if (!verified) return;
    const timer = setTimeout(finishVerifying, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [verified, finishVerifying]);

  async function resend() {
    setNotice(null);
    try {
      await resendCode.mutateAsync();
      setError(null);
      setCodeRejected(false);
      setNotice("New code sent. Check your inbox.");
      setCode("");
      setSecondsToResend(RESEND_WAIT_SECONDS);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 429 && failure.retryAfterSeconds) {
        setError(null);
        setCodeRejected(false);
        setSecondsToResend(failure.retryAfterSeconds);
      } else if (failure instanceof ApiError && failure.status === 409) {
        // Verified in another tab or device: look the User up again, which opens the app.
        retry();
      } else {
        setCodeRejected(false);
        setError("Something went wrong. Please try again.");
      }
    }
  }

  async function check(value: string) {
    setChecking(true);
    setError(null);
    setNotice(null);
    setCodeRejected(false);
    try {
      await verifyEmail(value);
    } catch (failure) {
      setError(verificationErrorMessage(failure));
      setCodeRejected(failure instanceof ApiError && failure.status === 400);
      setCode("");
    } finally {
      setChecking(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      setCodeRejected(false);
      setError("Couldn't sign out. Check your connection and try again.");
      setSigningOut(false);
    }
  }

  if (verified) {
    return (
      <AuthLayout
        title="Email verified"
        subtitle={
          <>
            <strong>{user?.email}</strong> is confirmed. Taking you to Nimbus…
          </>
        }
        gap={22}
        icon={
          <span className={classes.verifiedMark} aria-hidden>
            ✓
          </span>
        }
      >
        <div className={classes.progress} aria-hidden>
          <div
            className={classes.progressFill}
            style={{ "--confirm-ms": `${CONFIRM_MS}ms` } as CSSProperties}
          />
        </div>
        <AuthSubmit type="button" onClick={finishVerifying}>
          Continue
        </AuthSubmit>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Verify your email"
      phoneFill
      subtitle={
        <>
          We sent a 6-digit code to <strong>{user?.email}</strong>. It expires in 15 minutes.
        </>
      }
      gap={22}
    >
      <AuthForm
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === CODE_LENGTH && !checking) void check(code);
        }}
      >
        <CodePinInput
          value={code}
          onChange={setCode}
          onComplete={(value) => void check(value)}
          disabled={checking}
          error={codeRejected}
          ariaLabel="Verification code digit"
        />
        {error && (
          <div className={classes.codeError} role="alert">
            <span className={classes.codeErrorMark} aria-hidden>
              !
            </span>
            {error}
          </div>
        )}
        {/* Always in the page, so a screen reader announces the text when it appears in it. */}
        <VisuallyHidden role="status">{shownNotice}</VisuallyHidden>
        {shownNotice && !error && (
          <div className={classes.codeNotice} aria-hidden>
            <span className={classes.codeNoticeMark}>✓</span>
            {shownNotice}
          </div>
        )}
        <PinnedSubmit>
          <AuthSubmit loading={checking} disabled={code.length < CODE_LENGTH}>
            Verify
          </AuthSubmit>
        </PinnedSubmit>
        <div className={classes.codeLinks}>
          {/* Stays a button while it counts down, so keyboard focus isn't lost when it is pressed. */}
          <Anchor
            component="button"
            type="button"
            onClick={() => {
              if (!waiting && !resending) void resend();
            }}
            aria-disabled={waiting || resending}
            c={waiting ? "dimmed" : undefined}
          >
            {resending ? (
              <>
                <Loader size={12} color="currentColor" mr={8} />
                Sending…
              </>
            ) : waiting ? (
              `Resend code in ${clock(secondsToResend)}`
            ) : (
              "Resend code"
            )}
          </Anchor>
          <Anchor
            component="button"
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            Use a different email
          </Anchor>
        </div>
      </AuthForm>
    </AuthLayout>
  );
}
