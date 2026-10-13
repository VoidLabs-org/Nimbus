package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sets or changes a User's password. A User who has one must give it first; a User without one (they only
 * sign in with a Linked identity) can set their first. Checking and hashing are slow, so they happen outside any
 * transaction; only the update shares one. Too many wrong current passwords block further tries for a while.
 */
@Service
class Passwords {

	private final UserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final Sessions sessions;

	private final TransactionTemplate transaction;

	/** Wrong guesses at the current password, per User: a stolen access token mustn't allow unlimited tries. */
	private final SlidingWindowLimiter failuresByUser;

	Passwords(UserRepository users, PasswordEncoder passwordEncoder, Sessions sessions, AuthProperties properties,
			Clock clock, PlatformTransactionManager transactionManager) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.sessions = sessions;
		this.failuresByUser = new SlidingWindowLimiter(properties.failedSignInsPerEmail(), properties.limitWindow(),
				clock);
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/**
	 * The request must come from a session that is still running. Access tokens outlive their session by up to
	 * their lifetime, and a provider sign-in ends the sessions of whoever registered the email first: without
	 * this check that person's token could still set the password of an account that is no longer theirs. Every
	 * other session of the User ends once the password changes.
	 *
	 * @param sessionId the session of the access token making the request; it stays signed in
	 * @param currentPassword what the User types as their current password; ignored when they have none
	 * @throws InvalidBearerTokenException when the session has ended or the User no longer exists
	 * @throws WrongPasswordException when the User has a password and {@code currentPassword} isn't it
	 */
	void change(UUID userId, UUID sessionId, String currentPassword, String newPassword) {
		var user = users.findById(userId).orElseThrow(Passwords::tokenOutlivedUser);
		requireActive(sessionId, userId);
		if (user.passwordHash() != null) {
			// Counted before the slow check, so parallel guesses can't race past the limit; a success takes it back.
			var key = userId.toString();
			var attempt = failuresByUser.acquire(key, "Too many wrong passwords. Try again later.");
			if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.passwordHash())) {
				throw new WrongPasswordException();
			}
			failuresByUser.release(key, attempt);
		}
		var hash = passwordEncoder.encode(newPassword);
		transaction.executeWithoutResult(status -> {
			// Checked again inside: the session may have ended while the password was being hashed.
			requireActive(sessionId, userId);
			users.findById(userId).orElseThrow(Passwords::tokenOutlivedUser).changePassword(hash);
			sessions.endAllExcept(userId, sessionId);
		});
	}

	private void requireActive(UUID sessionId, UUID userId) {
		if (!sessions.isActive(sessionId, userId)) {
			throw new InvalidBearerTokenException("Your session has ended. Sign in again.");
		}
	}

	private static InvalidBearerTokenException tokenOutlivedUser() {
		return new InvalidBearerTokenException("The User for this token no longer exists");
	}

	static class WrongPasswordException extends RuntimeException {

		WrongPasswordException() {
			super("The current password is wrong");
		}

	}

}
