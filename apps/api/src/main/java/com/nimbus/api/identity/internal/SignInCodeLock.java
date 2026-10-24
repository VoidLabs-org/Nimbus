package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.stereotype.Component;

/**
 * The per-User lock on Sign-in codes: {@code nimbus.auth.wrong-sign-in-codes-per-hour} wrong codes in a sliding hour
 * block every code check for that User, wherever it happens (a pending sign-in, setup, View new codes), until the hour
 * clears. Each
 * pending sign-in allows only a few tries, so without this anyone with the password could keep guessing by signing in
 * again and again. Wrong passwords have their own limits in {@link SignIn}.
 */
@Component
class SignInCodeLock {

	static final Duration WINDOW = Duration.ofHours(1);

	private static final String MESSAGE = "Too many wrong codes. Try again later.";

	private final SlidingWindowLimiter wrongCodes;

	SignInCodeLock(AuthProperties properties, Clock clock) {
		this.wrongCodes = new SlidingWindowLimiter(properties.wrongSignInCodesPerHour(), WINDOW, clock);
	}

	/**
	 * Counts a code check for the User before the code is compared, so parallel guesses can't race past the lock.
	 *
	 * @return the check, for {@link #right} to take back when the code turns out right
	 * @throws LimitExceededException when the User got too many codes wrong in the last hour
	 */
	Instant check(UUID userId) {
		return wrongCodes.acquire(userId.toString(), MESSAGE);
	}

	/**
	 * Refuses a User who is over the lock before any work, such as taking their row lock, without counting anything.
	 *
	 * @throws LimitExceededException when the User got too many codes wrong in the last hour
	 */
	void requireUnder(UUID userId) {
		wrongCodes.requireUnder(userId.toString(), MESSAGE);
	}

	/** The code of {@code check} was right, so it doesn't count; wrong ones keep adding up. */
	void right(UUID userId, Instant check) {
		wrongCodes.release(userId.toString(), check);
	}

}
