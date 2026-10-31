import {
  ApiError,
  clock,
  GENERIC_ERROR,
  NETWORK_ERROR,
  NetworkError,
  passwordError,
  RESEND_WAIT_SECONDS,
  tooManyAttemptsIn,
  tooManyAttemptsMessage,
  wrongCodeMessage,
} from "@repo/api";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BackLink } from "../components/BackLink";
import { Button, LinkButton } from "../components/Button";
import { CODE_LENGTH, CodeField } from "../components/CodeField";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { useCountdown } from "../countdown";
import { useSession } from "../session/session";

/** Until the app can take a Sign-in code (#203), a User with Two-step verification resets on the web. */
const TWO_STEP_NOT_YET =
  "Two-step verification is on for this account, and the app can’t take its code yet. Reset your password on the web for now.";

/**
 * Back to the Sign in screen below, with the email filled in and the news that the password changed. The time makes
 * each reset's news new, so a second reset shows it again.
 */
function backToSignIn(email: string) {
  router.dismissTo({ pathname: "/sign-in", params: { email, passwordReset: String(Date.now()) } });
}

function failureMessage(failure: unknown): string {
  return failure instanceof NetworkError ? NETWORK_ERROR : GENERIC_ERROR;
}

/**
 * Forgot password, in two steps on one screen, as on the web (designs M4c–M4e). Step 1 has a Reset code emailed (the
 * server answers the same for every address, so this never says whether one is registered). Step 2 takes the code and
 * the new password together. A right code sets the password and goes back to Sign in with the email filled in.
 */
export default function ForgotPassword() {
  const { api } = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  // Under the button: a failure of the call itself, or the Two-step note.
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
  // The address the last code went to (lower-cased), so the email step can lead back to entering it.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [secondsToResend, setSecondsToResend] = useCountdown();
  // The address the countdown is for: the server limits sends per address, so another one is not held up by it.
  const [countdownFor, setCountdownFor] = useState<string | null>(null);
  // Sending was refused for now (a 429 with a wait), and the wait counts down.
  const [sendLimited, setSendLimited] = useState(false);
  // Reset attempts have their own limit, counted apart from Resend's wait.
  const [lockSeconds, setLockSeconds] = useCountdown();
  const waiting = secondsToResend > 0;
  const waitingForTyped = waiting && countdownFor === email.trim().toLowerCase();
  const locked = lockSeconds > 0;

  function startCountdown(address: string, seconds: number) {
    setCountdownFor(address.toLowerCase());
    setSecondsToResend(seconds);
  }

  /** The code and what was said about it go; the password the User typed stays. */
  function clearCode() {
    setCode("");
    setCodeMessage(null);
    setCodeRejected(false);
    setExpired(false);
  }

  /** Asks for a code. Answers true when it is on its way. */
  async function requestCode(address: string): Promise<boolean> {
    setSendLimited(false);
    setFormError(null);
    try {
      await api.requestPasswordReset(address);
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 429 && failure.retryAfterSeconds) {
        startCountdown(address, failure.retryAfterSeconds);
        setSendLimited(true);
      } else if (failure instanceof ApiError && failure.status === 429) {
        setFormError(tooManyAttemptsMessage(null));
      } else if (failure instanceof ApiError && failure.fieldErrors.email) {
        // On the code step there is no Email field to show it under.
        if (step === "email") setEmailMessage(failure.fieldErrors.email);
        else setFormError(failure.fieldErrors.email);
      } else {
        setFormError(failureMessage(failure));
      }
      return false;
    }
  }

  async function sendFirstCode() {
    const address = email.trim();
    if (!address) {
      setEmailMessage("Enter your email");
      return;
    }
    if (address.length > 254) {
      setEmailMessage("Email must be at most 254 characters");
      return;
    }
    if (waitingForTyped) return;
    setEmailMessage(null);
    setSending(true);
    const sent = await requestCode(address);
    setSending(false);
    if (!sent) return;
    setSentTo(address.toLowerCase());
    setEmail(address);
    clearCode();
    setPassword("");
    setPasswordMessage(null);
    setNotice(null);
    startCountdown(address, RESEND_WAIT_SECONDS);
    setStep("code");
  }

  async function sendNewCode() {
    setNotice(null);
    setResending(true);
    const sent = await requestCode(email);
    setResending(false);
    if (!sent) return;
    clearCode();
    setNotice("New code sent. Check your inbox.");
    startCountdown(email, RESEND_WAIT_SECONDS);
  }

  async function submitReset() {
    // Nothing to send once the code is gone: that would only spend a try on a dead code.
    if (code.length < CODE_LENGTH || checking || expired || locked) return;
    const tooShort = passwordError(password);
    setPasswordMessage(tooShort);
    if (tooShort) return;
    setFormError(null);
    setNotice(null);
    setCodeMessage(null);
    setCodeRejected(false);
    setChecking(true);
    try {
      await api.resetPassword({ email, code, newPassword: password });
      backToSignIn(email);
    } catch (failure) {
      showResetFailure(failure);
      setChecking(false);
    }
  }

  function showResetFailure(failure: unknown) {
    if (!(failure instanceof ApiError)) {
      setFormError(failureMessage(failure));
    } else if (failure.code === "invalid_code") {
      setCodeMessage(wrongCodeMessage(failure.triesLeft));
      setCodeRejected(true);
    } else if (failure.code === "code_expired") {
      setCodeMessage("This code has expired.");
      setExpired(true);
    } else if (failure.code === "two_step_required") {
      setFormError(TWO_STEP_NOT_YET);
    } else if (failure.status === 429) {
      if (failure.retryAfterSeconds) setLockSeconds(failure.retryAfterSeconds);
      else setFormError(tooManyAttemptsMessage(null));
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

  /** Back to the email step; what was typed stays, for "Enter the code" to come back to. */
  function back() {
    setNotice(null);
    setFormError(null);
    setStep("email");
  }

  /** Back to an empty email step, for another address. */
  function differentEmail() {
    clearCode();
    setPassword("");
    setPasswordMessage(null);
    setSentTo(null);
    back();
  }

  if (step === "email") {
    return (
      <Screen scroll>
        <BackLink label="Sign in" />
        <View style={styles.heading}>
          <Text weight="semibold" size={28} accessibilityRole="header">
            Forgot your password?
          </Text>
          <Text muted style={styles.body}>
            Enter your email and we’ll send a code if it’s registered.
          </Text>
        </View>
        <TextField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailMessage(null);
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          invalid={emailMessage !== null}
          onSubmitEditing={() => void sendFirstCode()}
        />
        {emailMessage ? <FormMessage message={emailMessage} indent /> : null}
        {sendLimited && waitingForTyped ? (
          <FormMessage message={tooManyAttemptsIn(secondsToResend)} indent />
        ) : null}
        {formError ? <FormMessage message={formError} indent /> : null}
        <Button
          label={waitingForTyped ? `Send code in ${clock(secondsToResend)}` : "Send code"}
          busy={sending}
          disabled={waitingForTyped}
          onPress={() => void sendFirstCode()}
        />
        {sentTo !== null && sentTo === email.trim().toLowerCase() ? (
          // A code already went to this address and still works: no need to wait for another.
          <View style={styles.enterCode}>
            <LinkButton label="Enter the code" onPress={() => setStep("code")} />
          </View>
        ) : null}
      </Screen>
    );
  }

  const shownNotice = waiting && !codeMessage ? notice : null;
  return (
    <Screen scroll>
      <BackLink label="Back" onPress={back} />
      <View style={styles.heading}>
        <Text weight="semibold" size={28} accessibilityRole="header">
          Check your email
        </Text>
        <Text muted style={styles.body}>
          If <Text weight="semibold">{email}</Text> is registered, we sent a 6-digit code.
        </Text>
      </View>
      <CodeField
        label="Reset code"
        value={code}
        onChangeText={(value) => {
          setCode(value);
          // The message is about the code that was sent, not a different one being typed now.
          if (value !== code) {
            setCodeRejected(false);
            if (!expired) setCodeMessage(null);
          }
        }}
        invalid={codeRejected}
        disabled={checking || resending || locked || expired}
      />
      {codeMessage ? <FormMessage message={codeMessage} /> : null}
      {locked ? <FormMessage message={tooManyAttemptsIn(lockSeconds)} /> : null}
      {sendLimited && waiting && !locked ? (
        <FormMessage message={tooManyAttemptsIn(secondsToResend)} />
      ) : null}
      {shownNotice ? <FormMessage message={shownNotice} kind="notice" /> : null}
      {expired ? (
        <Button
          label={waiting ? `Send a new code in ${clock(secondsToResend)}` : "Send a new code"}
          busy={resending}
          disabled={waiting}
          onPress={() => void sendNewCode()}
        />
      ) : (
        <>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!locked}
            invalid={passwordMessage !== null}
            onSubmitEditing={() => void submitReset()}
          />
          <FormMessage
            message={passwordMessage ?? "8 to 128 characters"}
            kind={passwordMessage ? "error" : "hint"}
            indent
          />
          {formError ? <FormMessage message={formError} /> : null}
          <Button
            label="Reset password"
            busy={checking}
            disabled={code.length < CODE_LENGTH || locked}
            onPress={() => void submitReset()}
          />
        </>
      )}
      {expired && formError ? <FormMessage message={formError} /> : null}
      <View style={styles.spacer} />
      <View style={styles.links}>
        <LinkButton
          label={
            resending
              ? "Sending…"
              : locked
                ? "Resend paused"
                : waiting
                  ? `Resend code in ${clock(secondsToResend)}`
                  : "Resend code"
          }
          disabled={waiting || resending || locked}
          onPress={() => void sendNewCode()}
        />
        <LinkButton label="Use a different email" onPress={differentEmail} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  body: { lineHeight: 22 },
  spacer: { flex: 1 },
  links: { flexDirection: "row", justifyContent: "space-between" },
  enterCode: { alignItems: "center" },
});
