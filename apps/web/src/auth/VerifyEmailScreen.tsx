import { Alert, Anchor, PinInput, Text } from "@mantine/core";
import { useState } from "react";
import { ApiError } from "../api/client";
import { tooManyAttemptsMessage } from "../api/messages";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./useSession";

const CODE_LENGTH = 6;

/** What to tell the User when the server refused their code. */
function verificationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "invalid_code") {
      const left = error.triesLeft;
      return left === null
        ? "That code is wrong."
        : `That code is wrong. ${left} ${left === 1 ? "try" : "tries"} left.`;
    }
    if (error.code === "code_expired") {
      return "That code has expired, or was cancelled after too many wrong tries.";
    }
    if (error.status === 429) return tooManyAttemptsMessage(error.retryAfterSeconds);
  }
  return "Something went wrong. Please try again.";
}

/**
 * What a signed-in User sees, in place of the whole app, until they enter the Verification code emailed to
 * them. The code goes in six boxes that submit by themselves after the last digit (a pasted code fills them
 * all). A correct code opens the app at the address they were on. "Wrong email? Sign out" is the way out for a
 * typo.
 */
export function VerifyEmailScreen() {
  const { user, verifyEmail, logout } = useSession();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(value: string) {
    setChecking(true);
    setError(null);
    try {
      await verifyEmail(value);
    } catch (failure) {
      setError(verificationErrorMessage(failure));
      setCode("");
    } finally {
      setChecking(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      setError("Couldn't sign out. Check your connection and try again.");
      setSigningOut(false);
    }
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        <>
          We sent a 6-digit code to <strong>{user?.email}</strong>.
        </>
      }
      gap={24}
    >
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <PinInput
        length={CODE_LENGTH}
        type="number"
        inputMode="numeric"
        oneTimeCode
        autoFocus
        size="lg"
        value={code}
        onChange={setCode}
        onComplete={(value) => void check(value)}
        disabled={checking}
        error={error !== null}
        ariaLabel="Verification code digit"
      />
      <Text size="sm">
        Wrong email?{" "}
        <Anchor
          component="button"
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          Sign out
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
