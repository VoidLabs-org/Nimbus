// Profile's rules and texts, the same in every app: the Profile picture's limits and messages, and Change email's.

/** What Profile accepts as a Profile picture: checked before anything is uploaded. */
export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

export const PICTURE_HINT = "JPEG, PNG or WebP, up to 5 MB.";

/** For a file too big or of another type, checked before uploading, or refused by the server for the same. */
export const WRONG_FILE = "That file is over 5 MB. Choose a JPEG, PNG or WebP up to 5 MB.";

/** The server's `unreadable_image`. */
export const UNREADABLE = "We couldn’t read that image. Try a different file.";

/** The server's 429 on the 10th-plus upload in an hour; the wait comes from `Retry-After`. */
export function uploadLimitMessage(retryAfterSeconds: number | null): string {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
  return `You've uploaded 10 photos this hour. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/**
 * Null when the file can be uploaded, otherwise what to tell the User. A size the phone didn't report is left to the
 * server, which refuses an oversized file with the same message.
 */
export function pictureFileError(file: { type: string; size?: number }): string | null {
  return PICTURE_TYPES.includes(file.type) && (file.size ?? 0) <= MAX_PICTURE_BYTES
    ? null
    : WRONG_FILE;
}

/** The letters drawn for a name without a picture: the first two words' first letters, or a lone word's first two. */
export function initialsOf(name: string): string {
  const words = name.split(" ");
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return words
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** "24 Oct 2026", in the same order and spelling wherever the phone or browser is set to. */
export function uploadedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whether two addresses are the same to the server, which compares them trimmed and lower-cased. */
export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Change email: the new address is the one the User has (`same_email`). */
export const SAME_EMAIL = "That’s already your email.";

/** Change email: another User has the address (`email_taken`). */
export const EMAIL_TAKEN = "That email is already used by another Nimbus account.";

/** Change email: a code for the new address the server refused (`invalid_code`), with the `triesLeft` it sent. */
export function emailChangeCodeMessage(triesLeft: number | null): string {
  return triesLeft === null
    ? "That code didn’t match."
    : `That code didn’t match. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

/** Confirm it's you asks for the password, then, with Two-step verification, a Sign-in code or a Recovery code. */
export type ConfirmPhase = "password" | "secondCode";

/** Confirm it's you: the title and the line under it for each phase. */
export function confirmHeading(phase: ConfirmPhase, recovery: boolean) {
  return phase === "password"
    ? {
        title: "Confirm it’s you",
        subtitle: "You signed in a while ago. Enter your password to keep going.",
      }
    : {
        title: "Enter your Sign-in code",
        subtitle: recovery
          ? "Two-step verification is on. Enter one of the recovery codes you saved."
          : "Two-step verification is on. Enter the 6-digit code from your authenticator app.",
      };
}

/** Confirm it's you: a wrong password (`errors.password`). */
export const WRONG_PASSWORD = "That password isn’t right.";
