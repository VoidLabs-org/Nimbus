import {
  ApiError,
  displayNameError,
  emailError,
  GENERIC_ERROR,
  NETWORK_ERROR,
  NetworkError,
  passwordError,
  tooManyAttemptsMessage,
} from "@repo/api";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BackLink, backToSignIn } from "../components/BackLink";
import { Button, LinkButton } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { ProviderButtons } from "../components/ProviderButtons";
import { Screen } from "../components/Screen";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { useSession } from "../session/session";

type Field = "displayName" | "email" | "password";

/**
 * Create an account (design M4a) with the web's checks and messages. The new User is signed in straight away, as an
 * Unverified User, and the Session's guards move the app on to the verify-email screen.
 */
export default function Register() {
  const { register } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    // The keyboard's Return can submit while the button is busy.
    if (busy) return;
    setError(null);
    const mistakes = Object.fromEntries(
      Object.entries({
        displayName: displayNameError(displayName),
        email: emailError(email),
        password: passwordError(password),
      }).filter(([, message]) => message !== null),
    ) as Partial<Record<Field, string>>;
    setFieldErrors(mistakes);
    if (Object.keys(mistakes).length > 0) return;

    setBusy(true);
    try {
      await register({ displayName: displayName.trim(), email: email.trim(), password });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setFieldErrors({ email: failure.message });
      } else if (failure instanceof ApiError && Object.keys(failure.fieldErrors).length > 0) {
        setFieldErrors(failure.fieldErrors);
      } else if (failure instanceof ApiError && failure.status === 429) {
        setError(tooManyAttemptsMessage(failure.retryAfterSeconds));
      } else if (failure instanceof ApiError && failure.status === 400) {
        setError(failure.message);
      } else if (failure instanceof NetworkError) {
        setError(NETWORK_ERROR);
      } else {
        setError(GENERIC_ERROR);
      }
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <BackLink label="Sign in" />
      <View style={styles.heading}>
        <Text weight="semibold" size={28} accessibilityRole="header">
          Create your account
        </Text>
        <Text muted>Start moving work from backlog to done.</Text>
      </View>
      <TextField
        label="Name"
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        textContentType="name"
        invalid={"displayName" in fieldErrors}
      />
      {fieldErrors.displayName ? <FormMessage message={fieldErrors.displayName} indent /> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        invalid={"email" in fieldErrors}
      />
      {fieldErrors.email ? <FormMessage message={fieldErrors.email} indent /> : null}
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        invalid={"password" in fieldErrors}
        onSubmitEditing={() => void submit()}
      />
      <FormMessage
        message={fieldErrors.password ?? "8 to 128 characters"}
        kind={fieldErrors.password ? "error" : "hint"}
        indent
      />
      {error ? <FormMessage message={error} indent /> : null}
      <Button label="Create account" busy={busy} onPress={() => void submit()} />
      <ProviderButtons />
      <View style={styles.footer}>
        <Text muted size={14}>
          Already have an account?
        </Text>
        <LinkButton label="Sign in" onPress={backToSignIn} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 4 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
});
