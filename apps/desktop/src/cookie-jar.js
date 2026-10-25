// The cookies the API sets, kept by the main process: a page on app:// can't carry them itself (see ADR 0007).
// Only what a first-party client needs: name, value, Path, Secure and when it ends. Domain, SameSite and HttpOnly
// don't apply, because the page never sees the jar and every request in it goes to the one configured API.

/** @typedef {{ name: string, value: string, path: string, secure: boolean, expires: number | null }} Cookie */

export class CookieJar {
  /** @type {Map<string, Cookie>} keyed by name and path, so one name can live on two paths */
  #cookies = new Map();

  /**
   * Applies the `Set-Cookie` headers of one response.
   *
   * @param {string[]} setCookies the header values
   * @param {string} requestPath the path that was requested, which a cookie without a Path takes the directory of
   * @param {number} now
   * @returns {boolean} whether the jar changed
   */
  store(setCookies, requestPath, now = Date.now()) {
    let changed = false;
    for (const header of setCookies) {
      const cookie = parse(header, requestPath, now);
      if (!cookie) continue;
      const key = `${cookie.name}\u0000${cookie.path}`;
      if (cookie.expires !== null && cookie.expires <= now) {
        changed = this.#cookies.delete(key) || changed;
      } else {
        this.#cookies.set(key, cookie);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * The `Cookie` header for a request to `pathname`, or null when nothing applies.
   *
   * @param {string} pathname
   * @param {{ secure: boolean, now?: number }} options `secure`: whether the connection may carry a Secure cookie
   */
  header(pathname, { secure, now = Date.now() }) {
    const sendable = [...this.#cookies.values()]
      .filter(
        (cookie) => (cookie.expires === null || cookie.expires > now) && (secure || !cookie.secure),
      )
      .filter((cookie) => pathMatches(cookie.path, pathname))
      // Longer paths first, as browsers send them.
      .sort((a, b) => b.path.length - a.path.length);
    return sendable.length === 0
      ? null
      : sendable.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  /** What to save: the cookies that last past this run, without those that have ended. */
  toJSON(now = Date.now()) {
    return [...this.#cookies.values()].filter(
      (cookie) => cookie.expires !== null && cookie.expires > now,
    );
  }

  /** @param {unknown} data what {@link toJSON} gave, possibly damaged; anything unreadable is left out */
  static fromJSON(data, now = Date.now()) {
    const jar = new CookieJar();
    if (!Array.isArray(data)) return jar;
    for (const item of data) {
      if (
        item &&
        typeof item.name === "string" &&
        item.name !== "" &&
        typeof item.value === "string" &&
        typeof item.path === "string" &&
        typeof item.secure === "boolean" &&
        typeof item.expires === "number" &&
        item.expires > now
      ) {
        jar.#cookies.set(`${item.name}\u0000${item.path}`, {
          name: item.name,
          value: item.value,
          path: item.path,
          secure: item.secure,
          expires: item.expires,
        });
      }
    }
    return jar;
  }

  clear() {
    this.#cookies.clear();
  }
}

/** @returns {Cookie | null} */
function parse(header, requestPath, now) {
  const [pair, ...attributes] = header.split(";");
  const equals = pair.indexOf("=");
  if (equals <= 0) return null;
  const cookie = {
    name: pair.slice(0, equals).trim(),
    value: pair.slice(equals + 1).trim(),
    path: defaultPath(requestPath),
    secure: false,
    expires: null,
  };
  if (cookie.name === "") return null;
  let maxAge = null;
  let expires = null;
  for (const attribute of attributes) {
    const at = attribute.indexOf("=");
    const name = (at === -1 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
    const value = at === -1 ? "" : attribute.slice(at + 1).trim();
    if (name === "path" && value.startsWith("/")) cookie.path = value;
    else if (name === "secure") cookie.secure = true;
    else if (name === "max-age" && /^-?\d+$/.test(value)) maxAge = Number(value);
    else if (name === "expires" && !Number.isNaN(Date.parse(value))) expires = Date.parse(value);
  }
  // Max-Age wins over Expires, and 0 or less means "gone now".
  if (maxAge !== null) cookie.expires = maxAge <= 0 ? 0 : now + maxAge * 1000;
  else cookie.expires = expires;
  return cookie;
}

/** RFC 6265's default path: the request's directory. */
function defaultPath(requestPath) {
  if (!requestPath.startsWith("/")) return "/";
  const last = requestPath.lastIndexOf("/");
  return last <= 0 ? "/" : requestPath.slice(0, last);
}

function pathMatches(cookiePath, requestPath) {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}
