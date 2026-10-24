package com.nimbus.api.identity.internal;

import java.time.Clock;

import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The second step of signing in for a User with Two-step verification: after the password, a pending sign-in waits
 * for a Sign-in code from the User's app, and only a right one lets a Session start. A code is accepted once: the step
 * that last signed the User in, and every older one, is refused. A refresh never comes here.
 */
@Service
class TwoStepSignIn {

	private final PendingSignIns pending;

	private final SignInCodeLock lock;

	private final TwoStepStore store;

	private final TwoStepSecrets secrets;

	private final UserRepository users;

	private final Clock clock;

	private final TransactionTemplate transaction;

	TwoStepSignIn(PendingSignIns pending, SignInCodeLock lock, TwoStepStore store, TwoStepSecrets secrets,
			UserRepository users, Clock clock, PlatformTransactionManager transactionManager) {
		this.pending = pending;
		this.lock = lock;
		this.store = store;
		this.secrets = secrets;
		this.users = users;
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/** Whether {@code user}, who just proved their password, also needs a Sign-in code. */
	boolean isRequired(User user) {
		return store.find(user.getId()).isPresent();
	}

	/** A pending sign-in for the User; returns its id, for {@link PendingSignIns#cookie}. */
	String start(User user) {
		return pending.start(user.getId());
	}

	/**
	 * Checks a Sign-in code for the pending sign-in and, when it is right, ends that pending sign-in and returns the
	 * User, for a Session to start.
	 *
	 * @param pendingId from the cookie, or null when there was none
	 * @throws SignInExpiredException when the pending sign-in is missing, unknown, used or expired, or this was its
	 * last wrong code allowed
	 * @throws TwoStep.WrongSignInCodeException when the code is wrong, with the tries left
	 * @throws LimitExceededException when the User got too many codes wrong in the last hour
	 */
	User finish(String pendingId, String code) {
		var found = pending.find(pendingId).orElseThrow(SignInExpiredException::new);
		var userId = found.userId();
		var check = lock.check(userId);
		return transaction.execute(status -> {
			// Locked, so two requests can't both sign in with one code.
			var user = users.findLockedById(userId).orElseThrow(SignInExpiredException::new);
			var authenticator = store.find(userId).orElseThrow(SignInExpiredException::new);
			var step = SignInCodeMath.matchingStep(secrets.decrypt(userId, authenticator.encryptedKey()), code,
					clock.instant(), authenticator.lastUsedStep());
			if (step.isEmpty()) {
				var triesLeft = pending.wrongCode(pendingId);
				if (triesLeft == 0) {
					throw new SignInExpiredException();
				}
				throw new TwoStep.WrongSignInCodeException(triesLeft);
			}
			lock.right(userId, check);
			if (!pending.take(pendingId)) {
				throw new SignInExpiredException();
			}
			store.useStep(userId, step.getAsLong());
			return user;
		});
	}

	/** Becomes a 401 with {@code code: sign_in_expired} that also clears the pending cookie. */
	static class SignInExpiredException extends RuntimeException {

		SignInExpiredException() {
			super("Your sign-in timed out. Sign in again.");
		}

	}

}
