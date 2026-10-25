// The packaged app's page lives on app://nimbus, where /api has no server. This forwards those requests to the real API
// from the main process, which also keeps the API's cookies: a page on app:// can't carry the SameSite=Strict refresh
// cookie of another site (see ADR 0007).

const DEFAULT_API_URL = "http://localhost:8080";

/** Headers that belong to the page's own connection or origin, not to the request the API should see. */
const NOT_FORWARDED = new Set([
  "host",
  "origin",
  "referer",
  "cookie",
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The API address from `NIMBUS_API_URL`.
 *
 * @param {string | undefined} value
 * @returns {URL}
 * @throws {Error} naming the variable, when it isn't an http(s) address
 */
export function parseApiUrl(value) {
  const text = value?.trim();
  if (!text) return new URL(DEFAULT_API_URL);
  let url;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw new Error(
      `NIMBUS_API_URL must be an http or https address like ${DEFAULT_API_URL}, not "${text}"`,
    );
  }
  return url;
}

/**
 * @param {object} options
 * @param {URL} options.apiUrl where the API is
 * @param {import("./cookie-jar.js").CookieJar} options.jar
 * @param {typeof fetch} [options.fetch]
 * @param {() => void} [options.onChange] called after the jar changed, to save it
 * @returns {(request: Request) => Promise<Response | null>} answers a request for /api, null for any other path
 */
export function createApiProxy({ apiUrl, jar, fetch = globalThis.fetch, onChange = () => {} }) {
  // A Secure cookie only goes over https, or to this computer.
  const safeConnection = apiUrl.protocol === "https:" || LOCAL_HOSTS.has(apiUrl.hostname);

  return async function handle(request) {
    const page = new URL(request.url);
    if (page.pathname !== "/api" && !page.pathname.startsWith("/api/")) return null;

    const target = new URL(page.pathname + page.search, apiUrl);
    const headers = new Headers();
    for (const [name, value] of request.headers) {
      if (!NOT_FORWARDED.has(name) && !name.startsWith("sec-fetch-")) headers.set(name, value);
    }
    const cookie = jar.header(target.pathname, { secure: safeConnection });
    if (cookie) headers.set("cookie", cookie);

    let upstream;
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        duplex: "half",
        // Redirects are the page's to follow.
        redirect: "manual",
        signal: request.signal,
      });
    } catch {
      return unreachable(apiUrl);
    }

    if (jar.store(upstream.headers.getSetCookie(), target.pathname)) onChange();

    const answer = new Headers();
    for (const [name, value] of upstream.headers) {
      // The page must never see cookies, and fetch has already decoded the body.
      if (name === "set-cookie" || name === "content-encoding") continue;
      if (name === "content-length" && upstream.headers.has("content-encoding")) continue;
      answer.set(name, value);
    }
    const location = answer.get("location");
    if (location?.startsWith(`${apiUrl.origin}/`)) {
      // A custom scheme has no `origin` (it reads "null"), so the page's own is built by hand.
      answer.set(
        "location",
        `${page.protocol}//${page.host}${location.slice(apiUrl.origin.length)}`,
      );
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: answer,
    });
  };
}

function unreachable(apiUrl) {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: "Bad Gateway",
      status: 502,
      detail: `The Nimbus server can't be reached. Check that it is running at ${apiUrl.origin}.`,
    }),
    { status: 502, headers: { "content-type": "application/problem+json" } },
  );
}
