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

	private final SlidingWindowLimiter failuresByEmail;

	private final SlidingWindowLimiter failuresByAddress;

	/** Compared against when the email is unknown, so that path costs as much time as a wrong password. */
	private final String unknownUserHash;

	SignIn(UserRepository users, PasswordEncoder passwordEncoder, AuthProperties properties, Clock clock) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.failuresByEmail = new SlidingWindowLimiter(properties.failedSignInsPerEmail(), properties.limitWindow(),
				clock);
		this.failuresByAddress = new SlidingWindowLimiter(properties.signInsPerAddress(), properties.limitWindow(),
				clock);
		this.unknownUserHash = passwordEncoder.encode("no User has this password");
	}

	/**
	 * Every attempt is counted up front, before the slow password check, so parallel guesses can't race past the
	 * limits. A success takes back only its own attempt, so failures (anyone's) keep adding up.
	 *
	 * @param fromAddress the caller's IP address; it is limited too, so one client can't spray guesses across
	 * many emails
	 * @throws LimitExceededException when this address or email failed too often recently, even if the password is
	 * right
	 * @throws InvalidCredentialsException when the email is unknown, has no password, or the password is wrong
	 */
	User signIn(String email, String password, String fromAddress) {
		var normalizedEmail = email.toLowerCase(Locale.ROOT);
		var addressAttempt = failuresByAddress.acquire(fromAddress, "Too many failed sign-ins. Try again later.");
		var emailAttempt = failuresByEmail.acquire(normalizedEmail, "Too many failed sign-ins. Try again later.");

		var user = users.findByEmail(normalizedEmail).orElse(null);
		var hash = user == null || user.passwordHash() == null ? unknownUserHash : user.passwordHash();
		if (!passwordEncoder.matches(password, hash) || user == null || user.passwordHash() == null) {
			throw new InvalidCredentialsException();
		}
		failuresByAddress.release(fromAddress, addressAttempt);
		failuresByEmail.release(normalizedEmail, emailAttempt);
		return user;
	}

	/**
	 * Forgets the failed sign-ins for {@code email}, so a User who just reset their password isn't locked out of
	 * signing in with it. The per-address count stays: it is about the client, not the account.
	 */
	void clearFailures(String email) {
		failuresByEmail.clear(email.toLowerCase(Locale.ROOT));
	}

	static class InvalidCredentialsException extends RuntimeException {

		InvalidCredentialsException() {
			super("Invalid email or password");
		}

	}

}
