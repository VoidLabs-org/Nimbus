package com.nimbus.api.identity.internal;

import java.io.Serializable;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Where a provider sign-in started by one of the apps hands its result back, with the challenge (the hash of the
 * app's verifier) the one-time code is bound to. Given on the start and kept in the handshake's short-lived HTTP
 * session like {@link ReturnPath}; none of it goes to the provider. Neither address is ever taken from the request,
 * so a crafted start can't send a code anywhere else:
 * <ul>
 * <li>the Desktop app (ADR 0008): its port on {@code 127.0.0.1} and the random path of this attempt
 * ({@code ?desktop=<challenge>&port=<port>&nonce=<path>})</li>
 * <li>the Mobile app: its own {@code nimbus://auth} link, which the phone's in-app browser hands to the app
 * ({@code ?mobile=<challenge>})</li>
 * </ul>
 * Serializable, like the session's other values, so a dev restart that keeps HTTP sessions keeps it too.
 */
sealed interface AppReturn extends Serializable {

	String CHALLENGE = "desktop";

	String PORT = "port";

	String NONCE = "nonce";

	String MOBILE_CHALLENGE = "mobile";

	String ATTRIBUTE = AppReturn.class.getName();

	/** Base64url of a SHA-256 hash, without padding. */
	Pattern CHALLENGE_FORMAT = Pattern.compile("[A-Za-z0-9_-]{43}");

	/** The hash of the app's verifier, which the exchange must match. */
	String challenge();

	/** Where the browser takes the code to the app. */
	default String withCode(String code) {
		return base() + "?code=" + URLEncoder.encode(code, StandardCharsets.UTF_8);
	}

	/**
	 * Where the browser tells the app the sign-in failed, with the same short code the sign-in page shows.
	 *
	 * @param provider left out when unknown
	 */
	default String withError(String error, String provider) {
		return base() + "?error=" + error + OAuthLoginHandler.providerParameter(provider);
	}

	String base();

	/**
	 * Keeps the request's app return for the end of the handshake when all of it is usable. Otherwise forgets any
	 * earlier one, and the handshake ends in the browser as usual.
	 */
	static void remember(HttpServletRequest request) {
		var parsed = Desktop.parse(request.getParameter(CHALLENGE), request.getParameter(PORT),
				request.getParameter(NONCE))
			.<AppReturn>map(desktop -> desktop)
			.or(() -> Mobile.parse(request.getParameter(MOBILE_CHALLENGE)));
		if (parsed.isPresent()) {
			request.getSession().setAttribute(ATTRIBUTE, parsed.get());
			return;
		}
		var session = request.getSession(false);
		if (session != null) {
			session.removeAttribute(ATTRIBUTE);
		}
	}

	/** The app return this handshake was started with, read before the handshake's session is dropped. */
	static Optional<AppReturn> recall(HttpServletRequest request) {
		var session = request.getSession(false);
		return session != null && session.getAttribute(ATTRIBUTE) instanceof AppReturn found ? Optional.of(found)
				: Optional.empty();
	}

	/** The Desktop app's port on {@code 127.0.0.1} and this attempt's random path. */
	record Desktop(String challenge, int port, String nonce) implements AppReturn {

		private static final Pattern NONCE_FORMAT = Pattern.compile("[A-Za-z0-9_-]{16,64}");

		/** Ports below this need special rights; the app always gets a higher one from the OS. */
		private static final int LOWEST_PORT = 1024;

		private static final int HIGHEST_PORT = 65535;

		static Optional<Desktop> parse(String challenge, String port, String nonce) {
			if (challenge == null || port == null || nonce == null || !CHALLENGE_FORMAT.matcher(challenge).matches()
					|| !NONCE_FORMAT.matcher(nonce).matches() || !port.matches("\\d{4,5}")) {
				return Optional.empty();
			}
			var number = Integer.parseInt(port);
			return number < LOWEST_PORT || number > HIGHEST_PORT ? Optional.empty()
					: Optional.of(new Desktop(challenge, number, nonce));
		}

		@Override
		public String base() {
			return "http://127.0.0.1:" + port + "/" + nonce;
		}

	}

	/**
	 * The Mobile app's link. Any app on the phone could claim the {@code nimbus} scheme and see the code, which is why
	 * the code is useless without the verifier only the Mobile app holds.
	 */
	record Mobile(String challenge) implements AppReturn {

		static final String LINK = "nimbus://auth";

		static Optional<AppReturn> parse(String challenge) {
			return challenge != null && CHALLENGE_FORMAT.matcher(challenge).matches()
					? Optional.of(new Mobile(challenge)) : Optional.empty();
		}

		@Override
		public String base() {
			return LINK;
		}

	}

}
