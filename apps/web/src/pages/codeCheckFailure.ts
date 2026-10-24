import { ApiError } from "../api/client";
import { GENERIC_ERROR } from "../api/messages";

/**
 * What a Security page window that checks a Sign-in code or a Recovery code (View new codes, Remove) does with a
 * refused check: a wrong code, the User's hourly lock, Two-step verification being off by now, or anything else.
 */
export function showCodeCheckFailure(
  failure: unknown,
  dialog: {
    /** What to say about a wrong code, which depends on the kind of code. */
    wrongCode: string;
    setError: (message: string) => void;
    /** Empties the 6-digit boxes. */
    clearCode: () => void;
    setLockSeconds: (seconds: number) => void;
    /** Two-step verification is off already: the window says so and closes. */
    onNotOn: () => void;
  },
) {
  // A 401 means this session ended: the app is already sending the User to sign in again.
  if (failure instanceof ApiError && failure.status === 401) return;
  if (failure instanceof ApiError && failure.code === "invalid_code") {
    dialog.setError(dialog.wrongCode);
    dialog.clearCode();
    return;
  }
  if (failure instanceof ApiError && failure.status === 429) {
    dialog.clearCode();
    if (failure.retryAfterSeconds) dialog.setLockSeconds(failure.retryAfterSeconds);
    else dialog.setError("Too many attempts. Try again later.");
    return;
  }
  if (failure instanceof ApiError && failure.code === "not_on") {
    dialog.onNotOn();
    return;
  }
  dialog.setError(GENERIC_ERROR);
}
