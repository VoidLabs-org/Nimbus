import { ApiError, GENERIC_ERROR, NetworkError, tooManyAttemptsMessage } from "@repo/api";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, LinkButton } from "../components/Button";
import { Logo, Screen } from "../components/Screen";
import { Toast } from "../components/Toast";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { useSession } from "../session/session";
import { useTheme } from "../theme";

/** Shown until the app can take a Sign-in code (#203). */
const TWO_STEP_NOT_YET =
  "Two-step verification isn’t available in the app yet. Sign in on the web for now.";

/**
 * Sign in with email and password (design M3a–M3c): just the logo and the form. After Forgot password it opens with
 * the email filled in and says the password changed (design M4f).
 */
export default function SignIn() {
  const theme = useTheme();
  const { signIn } = useSession();
  const params = useLocalSearchParams<{ email?: string; passwordReset?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Forgot password comes back to the Sign in screen already open below it, with the email it reset.
  const [filledFrom, setFilledFrom] = useState(params.email);
  if (params.email !== filledFrom) {
    setFilledFrom(params.email);
    if (params.email) setEmail(params.email);
  }

  async function submit() {
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const outcome = await signIn(email.trim(), password);
      if ("twoStepRequired" in outcome) setError(TWO_STEP_NOT_YET);
      // Signed in: the Session's guards move the app on to Home.
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        setError("Invalid email or password.");
      } else if (failure instanceof ApiError && failure.status === 429) {
        setError(tooManyAttemptsMessage(failure.retryAfterSeconds));
      } else if (failure instanceof ApiError && Object.keys(failure.fieldErrors).length > 0) {
        setFieldErrors(failure.fieldErrors);
      } else if (failure instanceof ApiError && failure.status === 400) {
        setError(failure.message);
      } else if (failure instanceof NetworkError) {
        setError("Can’t reach Nimbus. Check your connection and try again.");
      } else {
        setError(GENERIC_ERROR);
      }
    } finally {
      setBusy(false);
    }
  }

  const invalid = error === "Invalid email or password.";
  return (
    <Screen
      scroll
      overlay={
        params.passwordReset ? (
          // A new key for each reset, so a second one shows the toast again.
          <Toast
            key={params.passwordReset}
            message="Password updated. You were signed out on other devices."
          />
        ) : null
      }
    >
      <Logo />
      <View style={styles.heading}>
        <Text weight="semibold" size={28} accessibilityRole="header">
          Welcome back
        </Text>
        <Text muted>Sign in to Nimbus</Text>
      </View>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        invalid={invalid || "email" in fieldErrors}
      />
      {fieldErrors.email ? <FieldError message={fieldErrors.email} /> : null}
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        invalid={invalid || "password" in fieldErrors}
        aside={
          <LinkButton label="Forgot password?" onPress={() => router.push("/forgot-password")} />
        }
        onSubmitEditing={() => void submit()}
      />
      {fieldErrors.password ? <FieldError message={fieldErrors.password} /> : null}
      {error ? (
        <Text
          size={13}
          accessibilityRole="alert"
          style={[styles.error, { color: theme.toastError }]}
        >
          {error}
        </Text>
      ) : null}
      <Button label="Sign in" busy={busy} onPress={() => void submit()} />
      <View style={styles.footer}>
        <Text muted size={14}>
          New to Nimbus?
        </Text>
        <LinkButton label="Create an account" onPress={() => router.push("/register")} />
      </View>
    </Screen>
  );
}

function FieldError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Text size={13} style={[styles.error, { color: theme.toastError }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 24, gap: 4 },
  error: { paddingLeft: 20 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
});
