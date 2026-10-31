// What any Nimbus client needs to talk to the API and explain its failures, with no browser or React Native parts.
// The contract's types are generated into ./schema (pnpm --filter @repo/api generate).
export { clock } from "./clock";
export { ApiError, apiErrorFrom, EMAIL_UNVERIFIED, NetworkError } from "./errors";
export { failedLoad, type FailedLoad } from "./failure";
export {
  connectErrorMessage,
  GENERIC_ERROR,
  providerSignInErrorMessage,
  SIGN_IN_TIMED_OUT,
  tooManyAttemptsIn,
  tooManyAttemptsMessage,
  WRONG_RECOVERY_CODE,
  WRONG_SIGN_IN_CODE,
} from "./messages";
