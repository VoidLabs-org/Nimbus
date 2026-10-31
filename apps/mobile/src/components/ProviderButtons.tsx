import {
  ApiError,
  NETWORK_ERROR,
  NetworkError,
  providerName,
  providerSignInErrorMessage,
} from "@repo/api";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { apiUrl } from "../config";
import { openProviderSignIn } from "../session/providerSignIn";
import { useSession } from "../session/session";
import { radius, useTheme } from "../theme";
import { FormMessage } from "./FormMessage";
import { GitHubIcon, GoogleIcon } from "./ProviderIcons";
import { Logo, Screen } from "./Screen";
import { Text } from "./Text";

/** The providers the app has a button for, in the order to show them. An id not listed is not shown. */
const PROVIDERS = ["google", "github"] as const;

type Provider = { id: (typeof PROVIDERS)[number]; name: string };

/**
 * "or", then Google and GitHub (design M6a), only for the providers the server offers; nothing while it is asked, or
 * when it offers none or can't be reached, because the form still works. A button opens the provider in the in-app
 * browser; back in the app, "Signing you in" stays up (design M6b) while the code is traded for the sign-in, which
 * signs up a new User too. A User with Two-step verification goes on to the Sign-in code; a failure says what web's
 * sign-in page says (design M6d).
 */
export function ProviderButtons() {
  const theme = useTheme();
  const { api, exchange } = useSession();
  const offered = useQuery({ queryKey: ["providers"], queryFn: () => api.providers() });
  // The provider being signed in with: in the browser, then (`finishing`) being traded in.
  const [busy, setBusy] = useState<Provider | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set at once, unlike `busy`, so a second tap before the next render can't open a second browser.
  const started = useRef(false);

  const shown: Provider[] = PROVIDERS.filter((id) => offered.data?.includes(id)).map((id) => ({
    id,
    name: providerName(id) ?? id,
  }));
  if (shown.length === 0) return null;

  async function signInWith(provider: Provider) {
    if (started.current) return;
    started.current = true;
    setError(null);
    setBusy(provider);
    try {
      const outcome = await openProviderSignIn(apiUrl, provider.id);
      if (outcome.kind === "cancelled") {
        setError(providerSignInErrorMessage("cancelled", provider.id));
        return;
      }
      if (outcome.kind === "error") {
        setError(providerSignInErrorMessage(outcome.error, provider.id));
        return;
      }
      setFinishing(true);
      const signedIn = await exchange(outcome.code, outcome.verifier);
      if ("twoStepRequired" in signedIn) router.push("/two-step");
      // Signed in: the Session's guards move the app on to Home.
    } catch (failure) {
      setError(
        failure instanceof NetworkError
          ? NETWORK_ERROR
          : providerSignInErrorMessage(
              failure instanceof ApiError && failure.code ? failure.code : "failed",
              provider.id,
            ),
      );
    } finally {
      started.current = false;
      setFinishing(false);
      setBusy(null);
    }
  }

  return (
    <View style={styles.providers}>
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: theme.line }]} />
        <Text muted size={13}>
          or
        </Text>
        <View style={[styles.line, { backgroundColor: theme.line }]} />
      </View>
      <View style={styles.row}>
        {shown.map((provider) => (
          <Pressable
            key={provider.id}
            accessibilityRole="button"
            accessibilityLabel={`Continue with ${provider.name}`}
            accessibilityState={{ disabled: busy !== null, busy: busy === provider }}
            disabled={busy !== null}
            onPress={() => void signInWith(provider)}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.card, borderColor: theme.lineStrong },
              (pressed || busy === provider) && { backgroundColor: theme.seg },
              busy !== null && busy !== provider && styles.dimmed,
            ]}
          >
            {provider.id === "google" ? <GoogleIcon /> : <GitHubIcon color={theme.colorText} />}
            <Text weight="semibold" size={15}>
              {provider.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <FormMessage message={error} /> : null}

      <Modal visible={finishing} animationType="fade" onRequestClose={() => {}}>
        <Screen>
          <Logo />
          <View style={styles.finishing}>
            <ActivityIndicator size="large" color={theme.colorAccent} />
            <Text weight="semibold" size={28} accessibilityRole="header">
              Signing you in
            </Text>
            <Text muted>Finishing with {busy?.name ?? "your provider"}…</Text>
          </View>
        </Screen>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  providers: { gap: 14 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", gap: 10 },
  button: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  dimmed: { opacity: 0.6 },
  finishing: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
});
