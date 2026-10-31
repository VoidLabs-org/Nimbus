import {
  ApiError,
  clock,
  confirmHeading,
  type ConfirmPhase,
  EMAIL_TAKEN,
  emailChangeCodeMessage,
  GENERIC_ERROR,
  NETWORK_ERROR,
  NetworkError,
  RESEND_WAIT_SECONDS,
  SAME_EMAIL,
  sameAddress,
  tooManyAttemptsMessage,
  WRONG_PASSWORD,
  WRONG_RECOVERY_CODE,
  WRONG_SIGN_IN_CODE,
} from "@repo/api";
import { router, usePreventRemove } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BackLink } from "../components/BackLink";
import { Button, LinkButton } from "../components/Button";
import { CODE_LENGTH, CodeField } from "../components/CodeField";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import {
  SecondCodeField,
  secondCodeReady,
  switchSecondCodeLabel,
} from "../components/SecondCodeField";
import { Sheet } from "../components/Sheet";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { useCountdown } from "../countdown";
import type { ConfirmAnswer } from "../session/client";
import { useSession } from "../session/session";

/** The new address, Confirm it's you for an old sign-in, the code sent to the new address, or that code gone. */
type Step = "email" | "confirm" | "code" | "expired";

/**
 * Back to Profile, which says the email changed. The time makes each change's news new, so a second one shows it
 * again.
 */
function backToProfile(changedTo: string) {
  router.dismissTo({ pathname: "/profile", params: { changedTo, at: String(Date.now()) } });
}

/**
 * Change email (designs M7d, M7e), as on the web: a Verification code goes to the new address, and the email changes
 * only once it is entered, so a typo can't lock the User out. A sign-in too old for this asks for the password first
 * ("Confirm it's you"), and with Two-step verification a Sign-in code or a Recovery code too; a User with no password
 * signs in again instead. Leaving changes nothing; the pending change just expires.
 */
export default function ChangeEmail() {
  const { state, api, userChanged, signInAgainFor } = useSession();
  const [step, setStep] = useState<Step>("email");
  const [newEmail, setNewEmail] = useState("");
  // The address the code went to, as sent, so the copy names exactly where to look.
  const [sentTo, setSentTo] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  // A Resend that failed: said under the links, not about the code, which may still be right.
  const [resendError, setResendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  // An address was sent codes too fast: Send code is off for it while this counts down.
  const [waitSeconds, setWaitSeconds] = useCountdown();
  const [waitFor, setWaitFor] = useState("");
  const waiting = waitSeconds > 0 && sameAddress(newEmail, waitFor);
  const [resendSeconds, setResendSeconds] = useCountdown();
  // Confirm it's you.
  const [phase, setPhase] = useState<ConfirmPhase>("password");
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [secondCode, setSecondCode] = useState("");
  const [secondCodeError, setSecondCodeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // A User with no password can't confirm it's them: they sign in again.
  const [signInAgain, setSignInAgain] = useState(false);
  const [signInAgainError, setSignInAgainError] = useState<string | null>(null);
  const busy = sending || checking || confirming;
  // Leaving can't happen while a request is out (Back, a swipe, the phone's back button), so no answer lands, and no
  // code goes out, after the User has gone.
  usePreventRemove(busy, () => {});
  // Set once the email changed; back to Profile after the render that ends `busy`, which would block it otherwise.
  const [changedTo, setChangedTo] = useState<string | null>(null);
  useEffect(() => {
    if (changedTo) backToProfile(changedTo);
  }, [changedTo]);

  if (state.kind !== "signedIn") return null;
  const { user } = state;

  /** Asks for a code for `email`; `fromAddress` when it is the address step's (or Confirm it's you's) send. */
  async function send(email: string, fromAddress: boolean) {
    setSending(true);
    setResendError(null);
    try {
      await api.requestEmailChange(email);
      setSentTo(email);
      setCode("");
      setCodeError(null);
      setResendSeconds(RESEND_WAIT_SECONDS);
      setStep("code");
    } catch (failure) {
      sendFailed(failure, email, fromAddress);
    } finally {
      setSending(false);
    }
  }

  function sendFailed(failure: unknown, email: string, fromAddress: boolean) {
    if (failure instanceof ApiError && failure.code === "reauth_required") {
      if (user.hasPassword) {
        setPhase("password");
        setRecovery(false);
        setStep("confirm");
      } else {
        setSignInAgain(true);
      }
    } else if (failure instanceof ApiError && failure.status === 429) {
      const seconds = failure.retryAfterSeconds ?? RESEND_WAIT_SECONDS;
      if (fromAddress) {
        setWaitFor(email);
        setWaitSeconds(seconds);
        setStep("email");
      } else {
        setResendSeconds(seconds);
      }
    } else if (failure instanceof ApiError && failure.code === "same_email") {
      setEmailError(SAME_EMAIL);
      setStep("email");
    } else if (failure instanceof ApiError && failure.code === "email_taken") {
      setEmailError(EMAIL_TAKEN);
      setStep("email");
    } else if (!fromAddress) {
      // Not the code's error: the code typed may still be right.
      setResendError(
        failure instanceof NetworkError
          ? NETWORK_ERROR
          : "Couldn’t send a new code. Please try again.",
      );
    } else if (failure instanceof ApiError && failure.fieldErrors.email) {
      setEmailError(failure.fieldErrors.email);
      setStep("email");
    } else {
      setEmailError(failure instanceof NetworkError ? NETWORK_ERROR : GENERIC_ERROR);
      setStep("email");
    }
  }

  async function changeIt() {
    if (code.length !== CODE_LENGTH || busy || codeError !== null) return;
    setChecking(true);
    try {
      userChanged(await api.confirmEmailChange(code));
      setChecking(false);
      setChangedTo(sentTo);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "invalid_code") {
        setCodeError(emailChangeCodeMessage(failure.triesLeft));
      } else if (failure instanceof ApiError && failure.code === "code_expired") {
        setCode("");
        setStep("expired");
      } else if (failure instanceof ApiError && failure.code === "email_taken") {
        setEmailError(EMAIL_TAKEN);
        setStep("email");
      } else {
        setCodeError(failure instanceof NetworkError ? NETWORK_ERROR : GENERIC_ERROR);
      }
      setChecking(false);
    }
  }

  /** Confirm it's you: a right answer goes on to send the code to the address typed before the User was asked. */
  async function confirm(answer: ConfirmAnswer) {
    setConfirming(true);
    try {
      await api.confirmItsYou(answer);
      setConfirming(false);
      await send(newEmail.trim(), true);
    } catch (failure) {
      setConfirming(false);
      confirmRefused(failure);
    }
  }

  function confirmRefused(failure: unknown) {
    if (failure instanceof ApiError && failure.code === "no_password") {
      setSignInAgain(true);
    } else if (failure instanceof ApiError && failure.code === "two_step_required") {
      setPhase("secondCode");
    } else if (failure instanceof ApiError && failure.code === "invalid_two_step_code") {
      setSecondCodeError(recovery ? WRONG_RECOVERY_CODE : WRONG_SIGN_IN_CODE);
      if (!recovery) setSecondCode("");
    } else if (failure instanceof ApiError && failure.status === 429) {
      // Too many wrong passwords or codes; the server doesn't say which, and either way the wait is the same.
      const message = tooManyAttemptsMessage(failure.retryAfterSeconds);
      if (phase === "password") setPasswordError(message);
      else setSecondCodeError(message);
    } else if (failure instanceof ApiError && failure.fieldErrors.password) {
      setPasswordError(WRONG_PASSWORD);
      setPhase("password");
    } else {
      const message = failure instanceof NetworkError ? NETWORK_ERROR : GENERIC_ERROR;
      if (phase === "password") setPasswordError(message);
      else setSecondCodeError(message);
    }
  }

  /** Back to the new address, keeping what was typed so a typo can be fixed. */
  function backToEmail() {
    if (busy) return;
    setEmailError(null);
    setStep("email");
  }

  async function leaveToSignIn() {
    setSignInAgainError(null);
    try {
      await signInAgainFor("/profile");
    } catch {
      setSignInAgainError("Couldn't sign you out. Check your connection and try again.");
    }
  }

  const heading = confirmHeading(phase, recovery);
  return (
    <Screen scroll>
      {step === "email" ? (
        <BackLink
          label="Profile"
          onPress={() => {
            if (!busy) router.back();
          }}
        />
      ) : step === "confirm" && phase === "secondCode" ? (
        <BackLink
          label="Back"
          onPress={() => {
            setSecondCodeError(null);
            setPhase("password");
          }}
        />
      ) : (
        <BackLink label="Back" onPress={backToEmail} />
      )}

      {step === "email" ? (
        <>
          <Heading
            title="Change your email"
            body="We’ll send a code to the new address. Your email only changes once you enter it."
          />
          <TextField
            label="New email"
            value={newEmail}
            onChangeText={(value) => {
              setNewEmail(value);
              setEmailError(null);
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            invalid={emailError !== null}
            editable={!busy}
            onSubmitEditing={() => {
              const email = newEmail.trim();
              if (email !== "" && !busy && !waiting) void send(email, true);
            }}
          />
          {emailError ? (
            <FormMessage message={emailError} indent />
          ) : waiting ? (
            <FormMessage
              message={`Too many codes sent to this address. Try again in ${clock(waitSeconds)}.`}
              indent
            />
          ) : (
            <FormMessage
              message="Only your email changes. Your password, two-step verification, sign-ins and connected Google or GitHub accounts stay as they are."
              kind="hint"
              indent
            />
          )}
          <Button
            label="Send code"
            busy={sending}
            disabled={newEmail.trim() === "" || waiting}
            onPress={() => void send(newEmail.trim(), true)}
          />
        </>
      ) : step === "confirm" ? (
        <>
          <Heading title={heading.title} body={heading.subtitle} />
          {phase === "password" ? (
            <>
              <TextField
                label="Password"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setPasswordError(null);
                }}
                secureTextEntry
                autoFocus
                autoComplete="current-password"
                textContentType="password"
                maxLength={128}
                invalid={passwordError !== null}
                editable={!busy}
                onSubmitEditing={() => {
                  if (password !== "" && !busy) void confirm({ password });
                }}
              />
              {passwordError ? <FormMessage message={passwordError} indent /> : null}
              <Button
                label="Continue"
                busy={busy}
                disabled={password === ""}
                onPress={() => void confirm({ password })}
              />
            </>
          ) : (
            <>
              <SecondCodeField
                recovery={recovery}
                value={secondCode}
                onChangeText={(value) => {
                  setSecondCode(value);
                  setSecondCodeError(null);
                }}
                refused={secondCodeError !== null}
                disabled={busy}
              />
              {secondCodeError ? <FormMessage message={secondCodeError} /> : null}
              <View style={styles.switch}>
                <LinkButton
                  label={switchSecondCodeLabel(recovery)}
                  disabled={busy}
                  onPress={() => {
                    setRecovery(!recovery);
                    setSecondCode("");
                    setSecondCodeError(null);
                  }}
                />
              </View>
              <Button
                label="Continue"
                busy={busy}
                disabled={!secondCodeReady(recovery, secondCode, secondCodeError)}
                onPress={() =>
                  void confirm(
                    recovery
                      ? { password, recoveryCode: secondCode }
                      : { password, twoStepCode: secondCode },
                  )
                }
              />
            </>
          )}
        </>
      ) : step === "code" ? (
        <>
          <View style={styles.heading}>
            <Text weight="semibold" size={28} accessibilityRole="header">
              Check your new inbox
            </Text>
            <Text muted style={styles.body}>
              We sent a 6-digit code to <Text weight="semibold">{sentTo}</Text>.
              {codeError === null ? " It expires in 15 minutes." : ""}
            </Text>
          </View>
          <CodeField
            label="Verification code"
            value={code}
            onChangeText={(value) => {
              setCode(value);
              setCodeError(null);
            }}
            invalid={codeError !== null}
            disabled={busy}
          />
          {codeError ? <FormMessage message={codeError} /> : null}
          <Button
            label="Change email"
            busy={checking}
            disabled={code.length !== CODE_LENGTH || codeError !== null}
            onPress={() => void changeIt()}
          />
          <View style={styles.spacer} />
          <View style={styles.links}>
            <LinkButton
              label={
                sending
                  ? "Sending…"
                  : resendSeconds > 0
                    ? `Resend code in ${clock(resendSeconds)}`
                    : "Resend code"
              }
              disabled={busy || resendSeconds > 0}
              onPress={() => void send(sentTo, false)}
            />
            <LinkButton label="Use a different email" disabled={busy} onPress={backToEmail} />
          </View>
          {resendError ? <FormMessage message={resendError} /> : null}
        </>
      ) : (
        <>
          <View style={styles.heading}>
            <Text weight="semibold" size={28} accessibilityRole="header">
              This code has expired
            </Text>
            <Text muted style={styles.body}>
              Codes last 15 minutes. Send a new one to <Text weight="semibold">{sentTo}</Text>.
            </Text>
          </View>
          {resendError ? <FormMessage message={resendError} /> : null}
          <Button
            label={
              resendSeconds > 0 ? `Send a new code in ${clock(resendSeconds)}` : "Send a new code"
            }
            busy={sending}
            disabled={resendSeconds > 0}
            onPress={() => void send(sentTo, false)}
          />
          <Button
            label="Use a different email"
            variant="secondary"
            disabled={busy}
            onPress={backToEmail}
          />
        </>
      )}

      <Sheet open={signInAgain} onClose={() => setSignInAgain(false)}>
        <Text weight="semibold" size={22} accessibilityRole="header">
          Sign in again to change your email
        </Text>
        <Text muted style={styles.body}>
          You signed in a while ago. Sign in again, then change your email.
        </Text>
        {signInAgainError ? <FormMessage message={signInAgainError} /> : null}
        <Button label="Sign in again" onPress={() => void leaveToSignIn()} />
        <Button label="Cancel" variant="secondary" onPress={() => setSignInAgain(false)} />
      </Sheet>
    </Screen>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.heading}>
      <Text weight="semibold" size={28} accessibilityRole="header">
        {title}
      </Text>
      <Text muted style={styles.body}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  body: { lineHeight: 22 },
  spacer: { flex: 1 },
  links: { flexDirection: "row", justifyContent: "space-between" },
  switch: { alignItems: "flex-start" },
});
