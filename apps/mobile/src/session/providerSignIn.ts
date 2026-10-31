import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";

/** Where the API's callback hands a Mobile app sign-in back (`AppReturn.Mobile` on the server). */
export const RETURN_LINK = "nimbus://auth";

/** How a provider sign-in in the in-app browser ended, before the code is traded in. */
export type BrowserOutcome =
  | { kind: "code"; code: string; verifier: string }
  | { kind: "error"; error: string }
  | { kind: "cancelled" };

/**
 * Opens "Continue with Google or GitHub" in the phone's in-app browser (Chrome Custom Tabs, or
 * ASWebAuthenticationSession on iOS), which has the phone's saved logins and which Google accepts. The handshake is
 * started with the hash of a fresh verifier (RFC 7636 S256); the API's callback hands a one-time code to
 * `nimbus://auth`, and only this verifier can trade it in, so another app that sees the link gets nothing from it.
 */
export async function openProviderSignIn(
  apiUrl: string,
  provider: string,
): Promise<BrowserOutcome> {
  const verifier = base64Url(Crypto.getRandomBytes(32));
  const challenge = base64Url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );
  const start = `${apiUrl}/api/auth/oauth2/${encodeURIComponent(provider)}?mobile=${challenge}`;
  const result = await WebBrowser.openAuthSessionAsync(start, RETURN_LINK);
  if (result.type !== "success") return { kind: "cancelled" };
  const params = queryOf(result.url);
  const code = params.get("code");
  if (code) return { kind: "code", code, verifier };
  return { kind: "error", error: params.get("error") || "failed" };
}

/** The query of the `nimbus://auth?...` link, read by hand: it is fixed and short, and needs no URL parser. */
function queryOf(link: string): Map<string, string> {
  const query = link.split("#")[0]!.split("?")[1] ?? "";
  return new Map(
    query
      .split("&")
      .filter((pair) => pair !== "")
      .map((pair) => {
        const [name = "", value = ""] = pair.split("=");
        return [decodeURIComponent(name), decodeURIComponent(value.replace(/\+/g, " "))] as const;
      }),
  );
}

/** Base64url without padding, from bytes or from standard base64. */
function base64Url(value: Uint8Array | string): string {
  const base64 = typeof value === "string" ? value : btoa(String.fromCharCode(...value));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
