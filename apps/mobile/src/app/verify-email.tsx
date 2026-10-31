import {
  ApiError,
  clock,
  GENERIC_ERROR,
  NETWORK_ERROR,
  NetworkError,
  RESEND_WAIT_SECONDS,
  verificationCodeMessage,
} from "@repo/api";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, LinkButton } from "../components/Button";
import { CODE_LENGTH, CodeField } from "../components/CodeField";
import { FormMessage } from "../components/FormMessage";
import { Logo, Screen } from "../components/Screen";
import { Text } from "../components/Text";
import { useCountdown } from "../countdown";
import { useSession } from "../session/session";

/**
 * All an Unverified User sees (design M4b), until they enter the Verification code emailed to them. The last digit
 * sends the code; a right one opens the app (the Session's guards move on to Home). Resend mails a new code, then
 * waits 60 seconds, or the server's Retry-After, before it works again. Sign out, and "Use a different email" for a
 * typo, end the Session.
 */
export default function VerifyEmail() {
  const { state, api, verifyEmail, reload, signOut } = useSession();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The boxes go red only when the message is about the code itself.
  const [codeRejected, setCodeRejected] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [secondsToResend, setSecondsToResend] = useCountdown();
  const waiting = secondsToResend > 0;

  if (state.kind !== "signedIn") return null;
  const { email } = state.user;

  async function check(value: string) {
    setChecking(true);
    setError(null);
    setNotice(null);
    setCodeRejected(false);
    try {
      await verifyEmail(value);
    } catch (failure) {
      setError(verificationCodeMessage(failure));
      setCodeRejected(failure instanceof ApiError && failure.status === 400);
      // Without a connection the code wasn't looked at: it stays, to send again.
      if (!(failure instanceof NetworkError)) setCode("");
      setChecking(false);
    }
  }

  async function resend() {
    setNotice(null);
    setResending(true);
    try {
      await api.resendVerificationCode();
      setError(null);
      setCodeRejected(false);
      setCode("");
      setNotice("New code sent. Check your inbox.");
      setSecondsToResend(RESEND_WAIT_SECONDS);
    } catch (failure) {
      setCodeRejected(false);
      if (failure instanceof ApiError && failure.status === 429 && failure.retryAfterSeconds) {
        setError(null);
        setSecondsToResend(failure.retryAfterSeconds);
      } else if (failure instanceof ApiError && failure.status === 409) {
        // Verified on another device meanwhile: reading the User again opens the app.
        await reload().catch((error: unknown) =>
          setError(error instanceof NetworkError ? NETWORK_ERROR : GENERIC_ERROR),
        );
      } else {
        setError(failure instanceof NetworkError ? NETWORK_ERROR : GENERIC_ERROR);
      }
    } finally {
      setResending(false);
    }
  }

  async function leave() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setCodeRejected(false);
      setError("Couldn’t sign out. Check your connection and try again.");
      setSigningOut(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.top}>
        <Logo />
        <LinkButton label="Sign out" disabled={signingOut} onPress={() => void leave()} />
      </View>
      <View style={styles.heading}>
        <Text weight="semibold" size={28} accessibilityRole="header">
          Check your email
        </Text>
        <Text muted style={styles.body}>
          We sent a 6-digit code to <Text weight="semibold">{email}</Text>. Enter it to finish
          setting up.
        </Text>
      </View>
      <CodeField
        label="Verification code"
        value={code}
        onChangeText={setCode}
        onComplete={(value) => void check(value)}
        invalid={codeRejected}
        disabled={checking}
      />
      {error ? <FormMessage message={error} /> : null}
      {notice && waiting && !error ? <FormMessage message={notice} kind="notice" /> : null}
      <Button
        label="Verify"
        busy={checking}
        disabled={code.length < CODE_LENGTH}
        onPress={() => void check(code)}
      />
      <View style={styles.spacer} />
      <View style={styles.links}>
        <LinkButton
          label={
            resending
              ? "Sending…"
              : waiting
                ? `Resend code in ${clock(secondsToResend)}`
                : "Resend code"
          }
          disabled={waiting || resending}
          onPress={() => void resend()}
        />
        <LinkButton
          label="Use a different email"
          disabled={signingOut}
          onPress={() => void leave()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heading: { marginTop: 20, gap: 6 },
  body: { lineHeight: 22 },
  spacer: { flex: 1 },
  links: { flexDirection: "row", justifyContent: "space-between" },
});
