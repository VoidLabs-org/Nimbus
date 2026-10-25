// Where the Desktop app loads Nimbus from (ADR 0007): the website, at a URL. By default that is the dev server that
// `pnpm dev` and `pnpm dev:desktop` start; once Nimbus is hosted it is the hosted address.
const DEFAULT_NIMBUS_URL = "http://localhost:3000";

/**
 * The address from `NIMBUS_URL`.
 *
 * @param {string | undefined} value
 * @returns {URL}
 * @throws {Error} naming the variable, when it isn't an http(s) address
 */
export function parseNimbusUrl(value) {
  const text = value?.trim();
  if (!text) return new URL(DEFAULT_NIMBUS_URL);
  let url;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw new Error(
      `NIMBUS_URL must be an http or https address like ${DEFAULT_NIMBUS_URL}, not "${text}"`,
    );
  }
  return url;
}

/** The origin of an http(s) address; null for anything else (a data: or file: page has no usable origin). */
function webOrigin(address) {
  try {
    const url = new URL(address);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Whether the window may navigate from the page it shows to `target`. Within Nimbus, and within whatever site the
 * window is on at that moment: a Google or GitHub sign-in page (reached by a redirect from Nimbus) must be able to
 * submit its own form. A hop from one site to another, such as a Nimbus page linking to a stranger or a provider page
 * linking to a third site, is refused; those that ask for a new window open in the browser instead.
 *
 * @param {URL} nimbusUrl
 * @param {string} currentUrl the page being shown
 * @param {string} target
 */
export function isNavigationAllowed(nimbusUrl, currentUrl, target) {
  const to = webOrigin(target);
  if (to === null) return false;
  return to === nimbusUrl.origin || to === webOrigin(currentUrl);
}
