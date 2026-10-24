package com.nimbus.api.identity.internal;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Sign-ins waiting for their second step: the User proved their password, and a Sign-in code still has to follow. Each
 * has a random single-use id, which the browser holds in a cookie ({@link #COOKIE}) sent only to the code check; it
 * lasts {@link #LIFETIME} and allows {@link #MAX_WRONG_CODES} wrong codes. Kept in memory only, like
 * {@link LinkTickets}: a restart just sends the User back to sign in.
 */
@Component
class PendingSignIns {

	static final Duration LIFETIME = Duration.ofMinutes(5);

	static final int MAX_WRONG_CODES = 5;

	static final String COOKIE = "two_step_pending";

	private static final int BYTES = 32;

	private final ConcurrentHashMap<String, Pending> pending = new ConcurrentHashMap<>();

	private final SecureRandom random = new SecureRandom();

	private final Clock clock;

	PendingSignIns(Clock clock) {
		this.clock = clock;
	}

	/** A new pending sign-in for the User; returns its id, for the cookie. */
	String start(UUID userId) {
		var now = clock.instant();
		pending.values().removeIf(found -> !found.expiresAt().isAfter(now));
		var bytes = new byte[BYTES];
		random.nextBytes(bytes);
		var id = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		pending.put(id, new Pending(userId, 0, now.plus(LIFETIME)));
		return id;
	}

	/** The pending sign-in with this id; empty when it is missing, unknown, used or expired. */
	Optional<Pending> find(String id) {
		return Optional.ofNullable(id == null ? null : pending.get(id))
			.filter(found -> found.expiresAt().isAfter(clock.instant()));
	}

	/** Takes it away for good once the code was right. @return false when another request ended it first */
	boolean take(String id) {
		return pending.remove(id) != null;
	}

	/**
	 * Counts a wrong code; the last one allowed ends the pending sign-in.
	 *
	 * @return the tries left, 0 when it ended
	 */
	int wrongCode(String id) {
		var after = pending.computeIfPresent(id, (key, current) -> {
			var wrong = current.wrongCodes() + 1;
			return wrong >= MAX_WRONG_CODES ? null : new Pending(current.userId(), wrong, current.expiresAt());
		});
		return after == null ? 0 : MAX_WRONG_CODES - after.wrongCodes();
	}

	/** Only for the code check, and gone when the pending sign-in would be. */
	static ResponseCookie cookie(String id) {
		return cookie(id, LIFETIME);
	}

	/** Tells the browser to drop a pending sign-in that is over. */
	static ResponseCookie clearedCookie() {
		return cookie("", Duration.ZERO);
	}

	private static ResponseCookie cookie(String value, Duration maxAge) {
		return ResponseCookie.from(COOKIE, value)
			.httpOnly(true)
			.secure(true)
			.sameSite("Strict")
			.path("/api/auth/two-step")
			.maxAge(maxAge)
			.build();
	}

	/** @param wrongCodes wrong codes so far */
	record Pending(UUID userId, int wrongCodes, Instant expiresAt) {
	}

}
