package com.nimbus.api.identity.internal;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Sign-ins waiting for their second step: the User proved their password, or a provider vouched for them, and a
 * Sign-in code still has to follow. Each
 * has a random single-use id, which the browser holds in a cookie ({@link #COOKIE}) sent only to the code check; it
 * lasts {@link #LIFETIME} and allows {@link #MAX_WRONG_CODES} wrong codes. A User holds at most {@link #MAX_PER_USER}:
 * a new one drops their oldest, so signing in again and again can't fill the memory. Kept in memory only, like
 * {@link LinkTickets}: a restart just sends the User back to sign in.
 */
@Component
class PendingSignIns {

	static final Duration LIFETIME = Duration.ofMinutes(5);

	static final int MAX_WRONG_CODES = 5;

	/** Enough for a few browsers signing in at once. */
	static final int MAX_PER_USER = 3;

	static final String COOKIE = "two_step_pending";

	private static final int BYTES = 32;

	/** Expired ones are swept out at most this often, so a start doesn't scan everything every time. */
	private static final Duration SWEEP_INTERVAL = Duration.ofMinutes(1);

	private final ConcurrentHashMap<String, Pending> pending = new ConcurrentHashMap<>();

	/** Each User's pending ids, oldest first; may still hold ids that ended since. */
	private final ConcurrentHashMap<UUID, Deque<String>> byUser = new ConcurrentHashMap<>();

	private final SecureRandom random = new SecureRandom();

	private final Clock clock;

	private final AtomicReference<Instant> nextSweep;

	PendingSignIns(Clock clock) {
		this.clock = clock;
		this.nextSweep = new AtomicReference<>(clock.instant().plus(SWEEP_INTERVAL));
	}

	/**
	 * A new pending sign-in for the User; returns its id, for the cookie.
	 *
	 * @param passwordHash for a password sign-in, the hash the password was checked against: once it changes, the
	 * pending sign-in no longer counts
	 * @param profile for a Google or GitHub sign-in, what the provider sent, stored only once the code is right;
	 * null for a password sign-in
	 */
	String start(UUID userId, String passwordHash, ExternalProfile profile) {
		var now = clock.instant();
		sweepIfDue(now);
		var bytes = new byte[BYTES];
		random.nextBytes(bytes);
		var id = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		byUser.compute(userId, (key, ids) -> {
			var updated = ids == null ? new ArrayDeque<String>() : ids;
			updated.removeIf(old -> !pending.containsKey(old));
			pending.put(id, new Pending(userId, passwordHash, profile, 0, now.plus(LIFETIME)));
			updated.addLast(id);
			while (updated.size() > MAX_PER_USER) {
				pending.remove(updated.removeFirst());
			}
			return updated;
		});
		return id;
	}

	/** The pending sign-in with this id; empty when it is missing, unknown, used or expired. */
	Optional<Pending> find(String id) {
		return Optional.ofNullable(id == null ? null : pending.get(id))
			.filter(found -> found.expiresAt().isAfter(clock.instant()));
	}

	/**
	 * Takes it away for good once the code was right.
	 *
	 * @return what was taken, for {@link #putBack} if the sign-in fails after all; empty when another request ended it
	 * first
	 */
	Optional<Pending> take(String id) {
		return Optional.ofNullable(pending.remove(id));
	}

	/** Gives back one {@link #take} took, when the sign-in it was for could not be stored. */
	void putBack(String id, Pending taken) {
		pending.putIfAbsent(id, taken);
	}

	/**
	 * Counts a wrong code; the last one allowed ends the pending sign-in.
	 *
	 * @return the tries left, 0 when it ended
	 */
	int wrongCode(String id) {
		var after = pending.computeIfPresent(id, (key, current) -> {
			var wrong = current.wrongCodes() + 1;
			return wrong >= MAX_WRONG_CODES ? null
					: new Pending(current.userId(), current.passwordHash(), current.profile(), wrong,
							current.expiresAt());
		});
		return after == null ? 0 : MAX_WRONG_CODES - after.wrongCodes();
	}

	/** Ends it without a code, e.g. because the password that started it is no longer the User's. */
	void end(String id) {
		pending.remove(id);
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

	private void sweepIfDue(Instant now) {
		var due = nextSweep.get();
		// Only the thread that wins the compare-and-set sweeps; the others carry on.
		if (now.isBefore(due) || !nextSweep.compareAndSet(due, now.plus(SWEEP_INTERVAL))) {
			return;
		}
		pending.values().removeIf(found -> !found.expiresAt().isAfter(now));
		byUser.keySet().forEach(userId -> byUser.computeIfPresent(userId, (key, ids) -> {
			ids.removeIf(id -> !pending.containsKey(id));
			return ids.isEmpty() ? null : ids;
		}));
	}

	/**
	 * @param passwordHash for a password sign-in, the hash the password was checked against when it started
	 * @param profile for a provider sign-in, what the provider sent; null for a password sign-in
	 * @param wrongCodes wrong codes so far
	 */
	record Pending(UUID userId, String passwordHash, ExternalProfile profile, int wrongCodes, Instant expiresAt) {
	}

}
