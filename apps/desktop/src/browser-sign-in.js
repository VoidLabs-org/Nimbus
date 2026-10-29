// Google and GitHub sign-in through the system browser (ADR 0008, RFC 8252). The window never shows the provider's
// page: the browser does, and hands the result back to a port on 127.0.0.1 that is open only while the window waits.
// What comes back is a one-time code, which the page trades in with the verifier made here.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

/** Provider ids as the API names them (`/api/auth/oauth2/<provider>`). */
const PROVIDER_ID = /^[a-z0-9-]{1,32}$/;

/** As long as the API accepts a link ticket. */
const MAX_LINK_TICKET = 256;

function base64url(bytes) {
  return bytes.toString("base64url");
}

/** A new secret for one attempt (43 characters, RFC 7636); it stays in this process and the page. */
export function makeVerifier() {
  return base64url(randomBytes(32));
}

/** What the API is told at the start instead of the verifier: its SHA-256, as RFC 7636's S256. */
export function challengeOf(verifier) {
  return base64url(createHash("sha256").update(verifier, "ascii").digest());
}

/** The random path of one attempt on the port, so a stray request to the port does nothing. */
export function makeNonce() {
  return base64url(randomBytes(18));
}

/**
 * Where the browser starts the sign-in: the API on Nimbus's own origin, never anywhere else.
 *
 * @param {URL} nimbusUrl
 * @param {{ provider: string, linkTicket?: string | null, challenge: string, port: number, nonce: string }} attempt
 * @throws {Error} for a provider id or link ticket that isn't one, so a page can't open some other address
 */
export function startAddress(nimbusUrl, { provider, linkTicket, challenge, port, nonce }) {
  if (typeof provider !== "string" || !PROVIDER_ID.test(provider)) {
    throw new Error("Not a provider");
  }
  if (
    linkTicket != null &&
    (typeof linkTicket !== "string" || linkTicket === "" || linkTicket.length > MAX_LINK_TICKET)
  ) {
    throw new Error("Not a link ticket");
  }
  const url = new URL(`/api/auth/oauth2/${provider}`, nimbusUrl.origin);
  url.searchParams.set("desktop", challenge);
  url.searchParams.set("port", String(port));
  url.searchParams.set("nonce", nonce);
  if (linkTicket != null) url.searchParams.set("link", linkTicket);
  return url.href;
}

/**
 * What a request to the port brings back: the code, or the short error the sign-in page shows; null for a request
 * that isn't the attempt's (another path or method), which changes nothing.
 *
 * @param {string | undefined} method
 * @param {string | undefined} path the request's path and query, as Node gives it
 * @param {string} nonce
 * @returns {{ code: string } | { error: string, provider: string | null } | null}
 */
export function readHandback(method, path, nonce) {
  if (method !== "GET" || !path) return null;
  let url;
  try {
    url = new URL(path, "http://127.0.0.1");
  } catch {
    return null;
  }
  if (url.pathname !== `/${nonce}`) return null;
  const code = url.searchParams.get("code");
  if (code) return { code };
  return {
    error: url.searchParams.get("error") || "failed",
    provider: url.searchParams.get("provider"),
  };
}

/**
 * Where the browser tab ends: a Nimbus page saying the app took over, naming the provider, or that it didn't work.
 *
 * @param {URL} nimbusUrl
 * @param {boolean} handedBack whether a code came back
 * @param {string} provider the attempt's provider
 */
export function doneAddress(nimbusUrl, handedBack, provider) {
  const url = new URL("/auth/desktop-done", nimbusUrl.origin);
  url.searchParams.set("provider", provider);
  if (!handedBack) url.searchParams.set("failed", "1");
  return url.href;
}

/**
 * One sign-in through the browser at a time. `start` opens the port and the browser and settles with what came back,
 * or "cancelled" when the User pressed Cancel or started again; `reopen` opens the same address in the browser again.
 *
 * @param {{ nimbusUrl: URL, openExternal: (address: string) => unknown, onHandback?: () => void }} options
 *   `onHandback` runs when the browser brings a result, to bring the window forward
 */
export function browserSignIns({ nimbusUrl, openExternal, onHandback = () => {} }) {
  /** @type {{ address: string, finish: (result: object) => void } | null} */
  let current = null;
  // Counts starts and cancels, so a Cancel while the port is still opening ends that attempt too.
  let latest = 0;

  function cancel() {
    latest++;
    current?.finish({ outcome: "cancelled" });
  }

  /**
   * @param {{ provider: string, linkTicket?: string | null }} request
   * @returns {Promise<{ outcome: "code", code: string, verifier: string }
   *   | { outcome: "error", error: string, provider: string | null } | { outcome: "cancelled" }>}
   */
  async function start(request) {
    cancel();
    const mine = latest;
    const verifier = makeVerifier();
    const nonce = makeNonce();
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    if (mine !== latest) {
      server.close();
      return { outcome: "cancelled" };
    }
    const { port } = server.address();
    let address;
    try {
      address = startAddress(nimbusUrl, {
        ...request,
        challenge: challengeOf(verifier),
        port,
        nonce,
      });
    } catch (error) {
      server.close();
      throw error;
    }
    return new Promise((resolve) => {
      const attempt = {
        address,
        finish(result) {
          if (current !== attempt) return;
          current = null;
          server.close();
          // A browser may hold the connection open; nothing more is served on this port.
          server.closeAllConnections?.();
          resolve(result);
        },
      };
      current = attempt;
      server.on("request", (req, res) => {
        const handback = current === attempt ? readHandback(req.method, req.url, nonce) : null;
        if (!handback) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(302, {
          Location: doneAddress(nimbusUrl, "code" in handback, request.provider),
          Connection: "close",
        });
        res.end();
        attempt.finish(
          "code" in handback
            ? { outcome: "code", code: handback.code, verifier }
            : { outcome: "error", ...handback },
        );
        onHandback();
      });
      openExternal(address);
    });
  }

  function reopen() {
    if (current) openExternal(current.address);
  }

  return { start, reopen, cancel };
}
