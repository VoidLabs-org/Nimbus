import { Anchor, Loader, VisuallyHidden } from "@mantine/core";
import { toast } from "@repo/ui/toast";
import { useMutation } from "@tanstack/react-query";
import { useState, type SyntheticEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, ApiError } from "../api/client";
import { tooManyAttemptsIn, tooManyAttemptsMessage } from "../api/messages";
import {
  AuthForm,
  AuthLayout,
  AuthPasswordInput,
  AuthSubmit,
  AuthTextInput,
} from "../auth/AuthLayout";
import classes from "../auth/AuthLayout.module.css";
import { CodeAlert as Alert, CODE_LENGTH, CodePinInput, PinnedSubmit } from "../auth/CodeEntry";
import { clock, RESEND_WAIT_SECONDS, useCountdown } from "../auth/countdown";
import { passwordError } from "../auth/password";
import { useSession } from "../auth/useSession";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Forgot password, in two steps on one page. Step 1 asks for the email and has a Reset code emailed to it (the
 * server answers the same for every address, so this never says whether one is registered). Step 2 takes the
 * code and the new password together. The email lives in memory only, so a reload starts again at step 1. A
 * right code sets the password; the User then goes to the sign-in page with the email filled in.
 */
export default function ForgotPasswordPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  // Under the button: a rate limit or a failure of the call itself.
  const [formError, setFormError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  // The boxes go red only when the message is about the code itself.
  const [codeRejected, setCodeRejected] = useState(false);
  // The code is gone (expired, or cancelled after too many wrong tries): only a new one helps.
  const [expired, setExpired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // One for each button, so a resend still under way doesn't show on the email step.
  const askForCode = (address: string) => api.requestPasswordReset(address);
  const sendCode = useMutation({ mutationFn: askForCode });
  const resendCode = useMutation({ mutationFn: askForCode });
  const resetPassword = useMutation({
    mutationFn: (input: Parameters<typeof api.resetPassword>[0]) => api.resetPassword(input),
  });
  const sending = sendCode.isPending;
  const resending = resendCode.isPending;
  const checking = resetPassword.isPending;
  const [secondsToResend, setSecondsToResend] = useCountdown();
  // The address the countdown is for: the server limits sends per address, so another one is not held up by it.
  const [countdownFor, setCountdownFor] = useState<string | null>(null);
  const waiting = secondsToResend > 0;
  const waitingForTyped = waiting && countdownFor === email.trim().toLowerCase();
  // The server refused for now (a 429 with a wait): the form is off and the wait counts down until it ends.
  const [limited, setLimited] = useState(false);
  const sendLimited = limited && waiting;
  // Reset attempts have their own limit, so their wait runs apart from the one Resend counts down.
  const [lockSeconds, setLockSeconds] = useCountdown();
  const rateLimited = sendLimited || lockSeconds > 0;
  const limitSeconds = Math.max(sendLimited ? secondsToResend : 0, lockSeconds);
  // The confirmation goes with the countdown: a minute on, it is no longer news.
  const shownNotice = waiting ? notice : null;

  if (user) return <Navigate to="/" replace />;

  /** The code and what was said about it go; the password the User typed stays. */
  function clearCode() {
    setCode("");
    setCodeMessage(null);
    setCodeRejected(false);
    setExpired(false);
  }

  /** Back to an empty form, for another address. */
  function clearCodeState() {
    clearCode();
    setPassword("");
    setPasswordMessage(null);
  }

  function startCountdown(address: string, seconds: number) {
    setCountdownFor(address.toLowerCase());
    setSecondsToResend(seconds);
  }

  /** A 429: with a wait the form is disabled and counts it down; without one the message is all there is. */
  function showRateLimit(failure: ApiError, address: string, sending: boolean) {
    if (failure.retryAfterSeconds) {
      if (sending) {
        startCountdown(address, failure.retryAfterSeconds);
        setLimited(true);
      } else {
        setLockSeconds(failure.retryAfterSeconds);
      }
      setFormError(null);
    } else {
      setFormError(tooManyAttemptsMessage(null));
    }
  }

  /** Asks for a code. Returns true when it is on its way. */
  async function requestCode(
    address: string,
    request: typeof sendCode | typeof resendCode,
  ): Promise<boolean> {
    setLimited(false);
    try {
      await request.mutateAsync(address);
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 429) {
        showRateLimit(failure, address, true);
      } else {
        setFormError(GENERIC_ERROR);
      }
      return false;
    }
  }

  async function sendFirstCode(event: SyntheticEvent) {
    event.preventDefault();
    const address = email.trim();
    setFormError(null);
    if (!address) {
      setEmailError("Enter your email");
      return;
    }
    if (address.length > 254) {
      setEmailError("Email must be at most 254 characters");
      return;
    }
    if (waitingForTyped) return;
    setEmailError(null);
    const sent = await requestCode(address, sendCode);
    if (!sent) return;
    setEmail(address);
    clearCodeState();
    setNotice(null);
    startCountdown(address, RESEND_WAIT_SECONDS);
    setStep("code");
  }

  async function sendNewCode() {
    setNotice(null);
    setFormError(null);
    const sent = await requestCode(email, resendCode);
    if (!sent) return;
    clearCode();
    setNotice("New code sent. Check your inbox.");
    startCountdown(email, RESEND_WAIT_SECONDS);
  }

  async function submitReset(event: SyntheticEvent) {
    event.preventDefault();
    // Nothing to send once the code is gone: that would only spend a try on a dead code.
    if (code.length < CODE_LENGTH || checking || expired) return;
    const tooShort = passwordError(password);
    setPasswordMessage(tooShort);
    if (tooShort) return;
    setFormError(null);
    setNotice(null);
    setCodeMessage(null);
    setCodeRejected(false);
    try {
      await resetPassword.mutateAsync({ email, code, newPassword: password });
      toast.success("Password updated. You were signed out on other devices.");
      void navigate("/login", { replace: true, state: { email } });
    } catch (failure) {
      showResetFailure(failure);
    }
  }

  function showResetFailure(failure: unknown) {
    if (!(failure instanceof ApiError)) {
      setFormError(GENERIC_ERROR);
    } else if (failure.code === "invalid_code") {
      const left = failure.triesLeft;
      setCodeMessage(
        left === null
          ? "That code isn’t right."
          : `That code isn’t right. ${left} ${left === 1 ? "try" : "tries"} left.`,
      );
      setCodeRejected(true);
    } else if (failure.code === "code_expired") {
      setCodeMessage("This code has expired.");
      setExpired(true);
    } else if (failure.status === 429) {
      showRateLimit(failure, email, false);
    } else if (failure.fieldErrors.newPassword) {
      // The code is kept: it was not looked at, so it costs no try.
      setPasswordMessage(failure.fieldErrors.newPassword);
    } else if (failure.fieldErrors.code) {
      setCodeMessage(failure.fieldErrors.code);
      setCodeRejected(true);
    } else {
      setFormError(GENERIC_ERROR);
    }
  }

  if (step === "email") {
    return (
      <AuthLayout
        title="Forgot your password?"
        subtitle="Enter your email and we’ll send you a 6-digit code."
        gap={22}
      >
        <AuthForm onSubmit={(event) => void sendFirstCode(event)}>
          <AuthTextInput
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              setEmailError(null);
            }}
            error={emailError}
          />
          <AuthSubmit loading={sending} disabled={waitingForTyped}>
            {waitingForTyped ? `Send code in ${clock(secondsToResend)}` : "Send code"}
          </AuthSubmit>
          {limited && waitingForTyped && <Alert>{tooManyAttemptsIn(secondsToResend)}</Alert>}
          {formError && <Alert>{formError}</Alert>}
        </AuthForm>
        <Anchor component={Link} to="/login" size="sm">
          Back to sign in
        </Anchor>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Check your email"
      phoneFill
      subtitle={
        <>
          If <strong>{email}</strong> is registered, we sent a 6-digit code.
        </>
      }
      gap={22}
    >
      <AuthForm onSubmit={(event) => void submitReset(event)}>
        <CodePinInput
          value={code}
          onChange={(value) => {
            setCode(value);
            // The message is about the code that was sent, not a different one being typed now. (The boxes also
            // report their value when they are enabled again after a try, which must not clear it.)
            if (value !== code) {
              setCodeRejected(false);
              setCodeMessage(null);
            }
          }}
          disabled={checking || resending || rateLimited}
          error={codeRejected}
          ariaLabel="Reset code digit"
        />
        {codeMessage && <Alert marked>{codeMessage}</Alert>}
        {rateLimited && <Alert marked>{tooManyAttemptsIn(limitSeconds)}</Alert>}
        {/* Always in the page, so a screen reader announces the text when it appears in it. */}
        <VisuallyHidden role="status">{shownNotice}</VisuallyHidden>
        {shownNotice && !codeMessage && (
          <div className={classes.codeNotice} aria-hidden>
            <span className={classes.codeNoticeMark}>✓</span>
            {shownNotice}
          </div>
        )}
        {/* Above the button, which sits at the bottom of a phone's screen, so the error stays near the fields. */}
        {formError && <Alert>{formError}</Alert>}
        {expired ? (
          <PinnedSubmit>
            <AuthSubmit
              type="button"
              loading={resending}
              disabled={waiting}
              onClick={() => void sendNewCode()}
            >
              {waiting ? `Send a new code in ${clock(secondsToResend)}` : "Send a new code"}
            </AuthSubmit>
          </PinnedSubmit>
        ) : (
          <>
            <AuthPasswordInput
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              description={passwordMessage ? undefined : "8 to 128 characters"}
              error={passwordMessage}
              disabled={rateLimited}
            />
            <PinnedSubmit>
              <AuthSubmit loading={checking} disabled={code.length < CODE_LENGTH || rateLimited}>
                Reset password
              </AuthSubmit>
            </PinnedSubmit>
          </>
        )}
        <div className={classes.codeLinks}>
          {/* Stays a button while it counts down, so keyboard focus isn't lost when it is pressed. */}
          <Anchor
            component="button"
            type="button"
            onClick={() => {
              if (!waiting && !resending) void sendNewCode();
            }}
            aria-disabled={waiting || resending}
            c={waiting ? "dimmed" : undefined}
          >
            {resending ? (
              <>
                <Loader size={12} color="currentColor" mr={8} />
                Sending…
              </>
            ) : rateLimited ? (
              "Resend paused"
            ) : waiting ? (
              `Resend code in ${clock(secondsToResend)}`
            ) : (
              "Resend code"
            )}
          </Anchor>
          <Anchor
            component="button"
            type="button"
            onClick={() => {
              clearCodeState();
              setNotice(null);
              setFormError(null);
              setStep("email");
            }}
          >
            Use a different email
          </Anchor>
        </div>
      </AuthForm>
    </AuthLayout>
  );
}
