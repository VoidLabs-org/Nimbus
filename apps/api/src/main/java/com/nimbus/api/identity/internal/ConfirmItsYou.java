package com.nimbus.api.identity.internal;

import java.util.UUID;

import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * "Confirm it's you": a User whose sign-in is too old for changing their email gives their password, and their
 * Sign-in code or a Recovery code when they have Two-step verification, instead of signing in again. The Session
 * remembers when, and {@link Sessions#requireProvedWithin} counts it like a fresh sign-in. Only the email change
 * asks for it; connecting a provider and setting up Two-step verification still need a recent sign-in.
 */
@Service
class ConfirmItsYou {

	private final UserRepository users;

	private final Sessions sessions;

	private final Passwords passwords;

	private final SecondCodes secondCodes;

	private final TransactionTemplate transaction;

	ConfirmItsYou(UserRepository users, Sessions sessions, Passwords passwords, SecondCodes secondCodes,
			PlatformTransactionManager transactionManager) {
		this.users = users;
		this.sessions = sessions;
		this.passwords = passwords;
		this.secondCodes = secondCodes;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/**
	 * The password is checked first, outside any transaction because it is slow, so a wrong one never tells whether
	 * the User has Two-step verification. The second code is checked under the User's row lock, with the Session.
	 *
	 * @throws InvalidBearerTokenException when the session has ended or the User no longer exists
	 * @throws NoPasswordException for a User who signs in only with Google or GitHub: they sign in again instead
	 * @throws WrongPasswordException when {@code password} isn't theirs
	 * @throws SlidingWindowLimiter.LimitExceededException after too many wrong passwords, or wrong codes in the hour
	 * @throws SecondCodes.TwoStepRequiredException when they have Two-step verification and gave no code
	 * @throws SecondCodes.WrongTwoStepCodeException when the code is wrong, or the Recovery code was used
	 */
	void confirm(UUID userId, UUID sessionId, String password, String twoStepCode, String recoveryCode) {
		var user = users.require(userId);
		// Fails fast, before a guess is counted or a hash is computed; the check that protects is the one below.
		sessions.requireActive(sessionId, userId);
		if (user.passwordHash() == null) {
			throw new NoPasswordException();
		}
		if (!passwords.isCurrent(user, password)) {
			throw new WrongPasswordException();
		}
		var failure = transaction.execute(status -> {
			users.findLockedById(userId).orElseThrow(
					() -> new InvalidBearerTokenException("The User for this token no longer exists"));
			var secondCodeFailure = secondCodes.check(userId, twoStepCode, recoveryCode);
			if (secondCodeFailure != null) {
				return secondCodeFailure;
			}
			sessions.markConfirmed(sessionId, userId);
			return null;
		});
		if (failure != null) {
			throw failure;
		}
	}

	/** Becomes a 409 with {@code code: no_password}: there is no password to confirm with, so sign in again. */
	static class NoPasswordException extends RuntimeException {

		NoPasswordException() {
			super("You sign in with Google or GitHub. Sign in again to do this.");
		}

	}

	/** Becomes a 400 with {@code errors.password}, like a field that failed validation, so the form can show it. */
	static class WrongPasswordException extends RuntimeException {

		WrongPasswordException() {
			super("That password isn't right.");
		}

	}

}
