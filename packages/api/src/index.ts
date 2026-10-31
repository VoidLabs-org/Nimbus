// What any Nimbus client needs to talk to the API and explain its failures, with no browser or React Native parts.
// The contract's types are generated into ./schema (pnpm --filter @repo/api generate).
export { clock } from "./clock";
export { ApiError, apiErrorFrom, EMAIL_UNVERIFIED, NetworkError } from "./errors";
export { failedLoad, type FailedLoad } from "./failure";
export {
  connectErrorMessage,
  GENERIC_ERROR,
  NETWORK_ERROR,
  providerName,
  providerSignInErrorMessage,
  RESEND_WAIT_SECONDS,
  SIGN_IN_TIMED_OUT,
  tooManyAttemptsIn,
  tooManyAttemptsMessage,
  WRONG_RECOVERY_CODE,
  verificationCodeMessage,
  WRONG_SIGN_IN_CODE,
  wrongCodeMessage,
} from "./messages";
export {
  confirmHeading,
  type ConfirmPhase,
  EMAIL_TAKEN,
  emailChangeCodeMessage,
  initialsOf,
  MAX_PICTURE_BYTES,
  PICTURE_HINT,
  PICTURE_TYPES,
  pictureFileError,
  SAME_EMAIL,
  sameAddress,
  UNREADABLE,
  uploadedOn,
  uploadLimitMessage,
  WRONG_FILE,
  WRONG_PASSWORD,
} from "./profile";
export { displayNameError, emailError, passwordError } from "./validation";
