package com.nimbus.api.identity.internal;

import java.io.Serializable;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Where a provider sign-in started by the Desktop app hands its result back (ADR 0008): the app's port on
 * {@code 127.0.0.1}, the random path of this attempt, and the challenge (the hash of the app's verifier) the
 * one-time code is bound to. Given on the start ({@code /api/auth/oauth2/<provider>?desktop=<challenge>&port=<port>&nonce=<path>})
 * and kept in the handshake's short-lived HTTP session like {@link ReturnPath}; none of it goes to the provider. The
 * host is always {@code 127.0.0.1}, never taken from the request, so a crafted start can't send a code anywhere else.
 * Serializable, like the session's other values, so a dev restart that keeps HTTP sessions keeps it too.
 */
record DesktopReturn(String challenge, int port, String nonce) implements Serializable {

	static final String CHALLENGE = "desktop";

	static final String PORT = "port";

	static final String NONCE = "nonce";

	private static final String ATTRIBUTE = DesktopReturn.class.getName();

	/** Base64url of a SHA-256 hash, without padding. */
	private static final Pattern CHALLENGE_FORMAT = Pattern.compile("[A-Za-z0-9_-]{43}");

	private static final Pattern NONCE_FORMAT = Pattern.compile("[A-Za-z0-9_-]{16,64}");

	/** Ports below this need special rights; the app always gets a higher one from the OS. */
	private static final int LOWEST_PORT = 1024;

	private static final int HIGHEST_PORT = 65535;

	/**
	 * Keeps the request's Desktop return for the end of the handshake when all of it is usable. Otherwise forgets any
	 * earlier one, and the handshake ends in the browser as usual.
	 */
	static void remember(HttpServletRequest request) {
		var parsed = parse(request.getParameter(CHALLENGE), request.getParameter(PORT), request.getParameter(NONCE));
		if (parsed.isPresent()) {
			request.getSession().setAttribute(ATTRIBUTE, parsed.get());
			return;
		}
		var session = request.getSession(false);
		if (session != null) {
			session.removeAttribute(ATTRIBUTE);
		}
	}

	/** The Desktop return this handshake was started with, read before the handshake's session is dropped. */
	static Optional<DesktopReturn> recall(HttpServletRequest request) {
		var session = request.getSession(false);
		return session != null && session.getAttribute(ATTRIBUTE) instanceof DesktopReturn found ? Optional.of(found)
				: Optional.empty();
	}

	private static Optional<DesktopReturn> parse(String challenge, String port, String nonce) {
		if (challenge == null || port == null || nonce == null || !CHALLENGE_FORMAT.matcher(challenge).matches()
				|| !NONCE_FORMAT.matcher(nonce).matches() || !port.matches("\\d{4,5}")) {
			return Optional.empty();
		}
		var number = Integer.parseInt(port);
		return number < LOWEST_PORT || number > HIGHEST_PORT ? Optional.empty()
				: Optional.of(new DesktopReturn(challenge, number, nonce));
	}

	/** Where the browser takes the code to the app. */
	String withCode(String code) {
		return base() + "?code=" + URLEncoder.encode(code, StandardCharsets.UTF_8);
	}

	/**
	 * Where the browser tells the app the sign-in failed, with the same short code the sign-in page shows.
	 *
	 * @param provider left out when unknown
	 */
	String withError(String error, String provider) {
		return base() + "?error=" + error + OAuthLoginHandler.providerParameter(provider);
	}

	private String base() {
		return "http://127.0.0.1:" + port + "/" + nonce;
	}

}
