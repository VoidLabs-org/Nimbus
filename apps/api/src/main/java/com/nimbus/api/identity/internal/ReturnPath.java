package com.nimbus.api.identity.internal;

import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The page a provider sign-in started from ({@code /login?returnTo=<page>}), kept in the handshake's short-lived
 * HTTP session so the User lands back on it. It never goes to the provider, and is gone with the handshake.
 * <p>
 * Only paths inside the app are kept, so a crafted link can't send a freshly signed-in User to another site. This
 * is the web app's {@code safeReturnPath} rule, checked without a browser's URL parser: a single leading slash and
 * no control characters, because browsers drop tabs and newlines and read a backslash as a slash, which would turn
 * {@code "/\t/evil.com"} or {@code "/\evil.com"} into another host. The web app checks the path again before
 * following it.
 */
final class ReturnPath {

	static final String PARAMETER = "returnTo";

	private static final String ATTRIBUTE = ReturnPath.class.getName();

	private static final int MAX_LENGTH = 2048;

	private ReturnPath() {
	}

	/** Keeps the request's {@code returnTo} for the end of the handshake, if it is a page inside the app. */
	static void remember(HttpServletRequest request) {
		var path = request.getParameter(PARAMETER);
		if (isInsideTheApp(path)) {
			request.getSession().setAttribute(ATTRIBUTE, path);
		}
	}

	/** The page to go back to, read before the handshake's session is dropped. */
	static Optional<String> recall(HttpServletRequest request) {
		var session = request.getSession(false);
		return session != null && session.getAttribute(ATTRIBUTE) instanceof String path ? Optional.of(path)
				: Optional.empty();
	}

	// "/" is left out too: it is where the User goes anyway.
	private static boolean isInsideTheApp(String path) {
		if (path == null || path.length() < 2 || path.length() > MAX_LENGTH || path.charAt(0) != '/') {
			return false;
		}
		if (path.charAt(1) == '/' || path.charAt(1) == '\\') {
			return false;
		}
		return path.chars().noneMatch(c -> c < 0x20 || c == 0x7f);
	}

}
