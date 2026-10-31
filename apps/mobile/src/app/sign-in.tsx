import { ApiError, GENERIC_ERROR, NetworkError, tooManyAttemptsMessage } from "@repo/api";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, LinkButton } from "../components/Button";
import { Logo, Screen } from "../components/Screen";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { useSession } from "../session/session";
import { useTheme } from "../theme";

/** Shown until the app can take a Sign-in code (#203). */
const TWO_STEP_NOT_YET =
  "Two-step verification isn’t available in the app yet. Sign in on the web for now.";

/** Sign in with email and password (design M3a–M3c): just the logo and the form. */
export default function SignIn() {
  const theme = useTheme();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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
    <Screen scroll>
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
