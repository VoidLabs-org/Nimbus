/**
 * Links the phone opens the app with. `nimbus://auth?code=…` is not a screen: it is the end of a Google or GitHub
 * sign-in in the in-app browser, which `openAuthSessionAsync` hands to the sign-in itself (`providerSignIn.ts`). Expo
 * Router would otherwise look for an `/auth` screen and show "Unmatched route", so the app stays where it is, or, when
 * the link opened it from scratch, starts as usual. Every other link goes through unchanged.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (isSignInReturn(path)) return initial ? "/" : null;
    return path;
  } catch {
    return initial ? "/" : null;
  }
}

/** `nimbus://auth`, with its query or none, as the phone or Expo Router spells it. */
function isSignInReturn(path: string): boolean {
  return /^(nimbus:\/\/\/?auth|\/?auth)(\?|#|$)/.test(path);
}
