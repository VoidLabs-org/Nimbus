package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.Locale;

import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Checks an email and password. Every failure looks the same, so it never reveals which emails are registered,
 * and too many failures for one email block it for a while.
 */
@Service
class SignIn {

	private final UserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final SlidingWindowLimiter failures;

	/** Compared against when the email is unknown, so that path costs as much time as a wrong password. */
	private final String unknownUserHash;

	SignIn(UserRepository users, PasswordEncoder passwordEncoder, AuthProperties properties, Clock clock) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.failures = new SlidingWindowLimiter(properties.failedSignInsPerEmail(), properties.limitWindow(), clock);
		this.unknownUserHash = passwordEncoder.encode("no User has this password");
	}

	/**
	 * @throws LimitExceededException when this email failed too often recently, even if the password is right
	 * @throws InvalidCredentialsException when the email is unknown, has no password, or the password is wrong
	 */
	User signIn(String email, String password) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		// Every attempt is counted up front, before the slow password check, so parallel guesses can't race
		// past the limit. A successful sign-in clears the count, so only failures add up.
		failures.acquire(normalizedEmail, "Too many failed sign-ins. Try again later.");

		var user = users.findByEmail(normalizedEmail).orElse(null);
		var hash = user == null || user.passwordHash() == null ? unknownUserHash : user.passwordHash();
		if (!passwordEncoder.matches(password, hash) || user == null || user.passwordHash() == null) {
			throw new InvalidCredentialsException();
		}
		failures.reset(normalizedEmail);
		return user;
	}

	static class InvalidCredentialsException extends RuntimeException {

		InvalidCredentialsException() {
			super("Invalid email or password");
		}

	}

}
