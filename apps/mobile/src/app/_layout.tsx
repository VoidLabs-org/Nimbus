import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { ApiError } from "@repo/api";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Href, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { SessionProvider, type SessionState, useSession } from "../session/session";
import { useTheme } from "../theme";

// The splash screen stays until the fonts are in and the stored Session is renewed (or known to be gone).
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A 4xx won't change by asking again; a lost connection or a 5xx may.
            retry: (failures, error) =>
              !(error instanceof ApiError && error.status < 500) && failures < 2,
          },
        },
      }),
  );
  // Server data counts as "in view" while the app is in the foreground, so stale data is read again on coming back
  // (TanStack Query's React Native setup; a browser tells it on its own).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) =>
      focusManager.setFocused(status === "active"),
    );
    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Screens />
      </SessionProvider>
    </QueryClientProvider>
  );
}

/**
 * Which screens exist depends on the Session: only the guards that are true let their screens show. When the screen
 * asked for is guarded off (at launch, on signing in or out, on a Session lost) the app goes to the one the Session
 * calls for, `home`.
 */
function Screens() {
  const theme = useTheme();
  const { state, welcomed } = useSession();
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  // A font that fails to load leaves the system font in its place, rather than an app stuck on its splash screen.
  const ready = (fontsLoaded || fontError !== null) && state.kind !== "starting";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedOut = state.kind === "signedOut";
  const home = homeFor(state.kind, welcomed);
  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colorBg } }}
      >
        <Stack.Protected guard={state.kind === "signedIn"} redirectTo={home}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={state.kind === "expired"} redirectTo={home}>
          <Stack.Screen name="session-expired" />
        </Stack.Protected>
        <Stack.Protected guard={state.kind === "offline"} redirectTo={home}>
          <Stack.Screen name="offline" />
        </Stack.Protected>
        <Stack.Protected guard={state.kind === "serverError"} redirectTo={home}>
          <Stack.Screen name="server-error" />
        </Stack.Protected>
        <Stack.Protected guard={signedOut && !welcomed} redirectTo={home}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={signedOut} redirectTo={home}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="register" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** The screen each state of the Session belongs on. */
function homeFor(kind: SessionState["kind"], welcomed: boolean): Href {
  switch (kind) {
    case "signedIn":
      return "/";
    case "expired":
      return "/session-expired";
    case "offline":
      return "/offline";
    case "serverError":
      return "/server-error";
    default:
      return welcomed ? "/sign-in" : "/welcome";
  }
}
