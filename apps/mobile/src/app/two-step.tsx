import {
  ApiError,
  GENERIC_ERROR,
  NETWORK_ERROR,
  NetworkError,
  tooManyAttemptsIn,
  tooManyAttemptsMessage,
  WRONG_RECOVERY_CODE,
  wrongCodeMessage,
} from "@repo/api";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BackLink, backToSignIn } from "../components/BackLink";
import { Button, LinkButton } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { FormMessage } from "../components/FormMessage";
import { Screen } from "../components/Screen";
import {
  SecondCodeField,
  secondCodeReady,
  switchSecondCodeLabel,
} from "../components/SecondCodeField";
import { Text } from "../components/Text";
import { useCountdown } from "../countdown";
import { useSession } from "../session/session";

/**
 * Back to the Sign in screen below, which says the sign-in timed out. The time makes each timeout's news new, so a
 * second one shows it again.
 */
function backToSignInTimedOut() {
  router.dismissTo({ pathname: "/sign-in", params: { timedOut: String(Date.now()) } });
}

/**
 * The second step of a sign-in with Two-step verification (designs M5a–M5c): the Sign-in code from the authenticator
 * app, or a Recovery code for a User who lost their phone, and "Remember this device for 30 days" so this User's next
 * sign-in on this phone skips it. A right code opens the app; a pending sign-in that timed out or ended goes back to
 * Sign in, which says so.
 */
export default function TwoStep() {
  const { finishTwoStep, cancelTwoStep } = useSession();
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [secondCode, setSecondCode] = useState("");
  // About the User, not the kind of code, so switching between the two keeps it.
  const [rememberDevice, setRememberDevice] = useState(false);
  const [checking, setChecking] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The hourly lock is about the User too, so switching keeps its wait.
  const [lockSeconds, setLockSeconds] = useCountdown();
  const locked = lockSeconds > 0;
  const ready = secondCodeReady(useRecoveryCode, secondCode, codeMessage);

  /** Swaps the code boxes for the Recovery code field, or back; what was typed and said about it goes. */
  function switchTo(recovery: boolean) {
    setUseRecoveryCode(recovery);
    setSecondCode("");
    setCodeMessage(null);
    setFormError(null);
  }

  async function verify() {
    if (!ready || checking || locked) return;
    setChecking(true);
    setCodeMessage(null);
    setFormError(null);
    try {
      await finishTwoStep(
        useRecoveryCode ? { recoveryCode: secondCode } : { code: secondCode },
        rememberDevice,
      );
      // Signed in: the Session's guards move the app on to Home.
    } catch (failure) {
      setChecking(false);
      showFailure(failure);
    }
  }

  function showFailure(failure: unknown) {
    if (failure instanceof NetworkError) {
      setFormError(NETWORK_ERROR);
    } else if (!(failure instanceof ApiError)) {
      setFormError(GENERIC_ERROR);
    } else if (failure.code === "invalid_code") {
      setCodeMessage(
        useRecoveryCode
          ? wrongCodeMessage(failure.triesLeft, WRONG_RECOVERY_CODE)
          : wrongCodeMessage(failure.triesLeft),
      );
      // The boxes empty for the next code; a Recovery code stays, to correct a typo.
      if (!useRecoveryCode) setSecondCode("");
    } else if (failure.code === "sign_in_expired") {
      backToSignInTimedOut();
    } else if (failure.status === 429 && failure.retryAfterSeconds) {
      setLockSeconds(failure.retryAfterSeconds);
    } else if (failure.status === 429) {
      setFormError(tooManyAttemptsMessage(null));
    } else {
      setFormError(GENERIC_ERROR);
    }
  }

  return (
    <Screen scroll>
      <BackLink
        label="Sign in"
        onPress={() => {
          void cancelTwoStep();
          backToSignIn();
        }}
      />
      <View style={styles.heading}>
        <Text weight="semibold" size={28} accessibilityRole="header">
          {useRecoveryCode ? "Use a recovery code" : "Two-step verification"}
        </Text>
        <Text muted style={styles.body}>
          {useRecoveryCode
            ? "Each code works once. You saved them when you turned on two-step verification."
            : "Enter the 6-digit code from your authenticator app."}
        </Text>
      </View>
      <SecondCodeField
        recovery={useRecoveryCode}
        value={secondCode}
        onChangeText={(value) => {
          setSecondCode(value);
          // The message is about the code that was sent, not one being typed now.
          setCodeMessage(null);
        }}
        refused={codeMessage !== null}
        disabled={checking || locked}
        onSubmitEditing={() => void verify()}
      />
      {codeMessage ? <FormMessage message={codeMessage} /> : null}
      {locked ? <FormMessage message={tooManyAttemptsIn(lockSeconds)} /> : null}
      {formError ? <FormMessage message={formError} /> : null}
      <Checkbox
        label="Remember this device for 30 days"
        checked={rememberDevice}
        onChange={setRememberDevice}
        disabled={checking}
      />
      <Button
        label="Verify"
        busy={checking}
        disabled={!ready || locked}
        onPress={() => void verify()}
      />
      <View style={styles.spacer} />
      <View style={styles.links}>
        {useRecoveryCode ? null : (
          <Text muted size={14}>
            Lost your phone?
          </Text>
        )}
        <LinkButton
          label={switchSecondCodeLabel(useRecoveryCode)}
          disabled={checking}
          onPress={() => switchTo(!useRecoveryCode)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  body: { lineHeight: 22 },
  spacer: { flex: 1 },
  links: { flexDirection: "row", justifyContent: "center", gap: 6 },
});
