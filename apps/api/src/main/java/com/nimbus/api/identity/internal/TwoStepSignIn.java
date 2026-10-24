package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.OptionalLong;

import com.nimbus.api.identity.RecoveryCodeUsed;
import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The second step of signing in for a User with Two-step verification: after the password, a pending sign-in waits
 * for a Sign-in code from the User's app, and only a right one lets a Session start. A code is accepted once: the step
 * that last signed the User in, and every older one, is refused. A User who lost their phone gives one of their
 * Recovery codes instead, which then is used up. A refresh never comes here.
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

	private final ApplicationEventPublisher events;

	TwoStepSignIn(PendingSignIns pending, SignInCodeLock lock, TwoStepStore store, TwoStepSecrets secrets,
			UserRepository users, Clock clock, PlatformTransactionManager transactionManager,
			ApplicationEventPublisher events) {
		this.pending = pending;
		this.lock = lock;
		this.store = store;
		this.secrets = secrets;
		this.users = users;
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
		this.events = events;
	}

	/** Whether {@code user}, who just proved their password, also needs a Sign-in code. */
	boolean isRequired(User user) {
		return store.find(user.getId()).isPresent();
	}

	/** A pending sign-in for the User; returns its id, for {@link PendingSignIns#cookie}. */
	String start(User user) {
		return pending.start(user.getId(), user.passwordHash());
	}

	/**
	 * Checks a Sign-in code, or a Recovery code, for the pending sign-in and, when it is right, ends that pending
	 * sign-in and returns the User, for a Session to start. A right Recovery code is marked used and publishes
	 * {@link RecoveryCodeUsed}, in the same transaction.
	 *
	 * @param pendingId from the cookie, or null when there was none
	 * @param code the Sign-in code; ignored when {@code recoveryCode} is given
	 * @param recoveryCode a Recovery code, compared with capitals, spaces and the dash ignored; null for a Sign-in
	 * code
	 * @throws SignInExpiredException when the pending sign-in is missing, unknown, used or expired, the User's
	 * password changed since it started, or this was its last wrong code allowed
	 * @throws TwoStep.WrongSignInCodeException when the code is wrong (a Recovery code also when it was used), with
	 * the tries left
	 * @throws LimitExceededException when the User got too many codes wrong in the last hour
	 */
	User finish(String pendingId, String code, String recoveryCode) {
		var found = pending.find(pendingId).orElseThrow(SignInExpiredException::new);
		var userId = found.userId();
		return transaction.execute(status -> {
			// Locked, so two requests can't both sign in with one code.
			var user = users.findLockedById(userId).orElseThrow(SignInExpiredException::new);
			// A password change or reset ends what the old password started.
			if (!Objects.equals(user.passwordHash(), found.passwordHash())) {
				pending.end(pendingId);
				throw new SignInExpiredException();
			}
			var authenticator = store.find(userId).orElseThrow(SignInExpiredException::new);
			var key = secrets.decrypt(userId, authenticator.encryptedKey());
			// Counted only now, so failures that are not about the code never use up the User's hour.
			var check = lock.check(userId);
			// Postgres keeps microseconds, so the time is cut to them before it is stored and announced.
			var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
			var step = recoveryCode == null
					? SignInCodeMath.matchingStep(key, code, now, authenticator.lastUsedStep())
					: OptionalLong.empty();
			var recoveryCodeUsed = recoveryCode != null && store.useRecoveryCode(userId,
					secrets.hashRecoveryCode(userId, TwoStep.normalise(recoveryCode)), now);
			if (step.isEmpty() && !recoveryCodeUsed) {
				var triesLeft = pending.wrongCode(pendingId);
				if (triesLeft == 0) {
					throw new SignInExpiredException();
				}
				throw new TwoStep.WrongSignInCodeException(triesLeft);
			}
			lock.right(userId, check);
			var taken = pending.take(pendingId).orElseThrow(SignInExpiredException::new);
			// Taken now, under the lock, so no other request can use it; given back if the sign-in isn't stored.
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCompletion(int outcome) {
					if (outcome != STATUS_COMMITTED) {
						pending.putBack(pendingId, taken);
					}
				}
			});
			if (recoveryCodeUsed) {
				events.publishEvent(new RecoveryCodeUsed(userId, now, store.recoveryCodesLeft(userId)));
			}
			else {
				store.useStep(userId, step.getAsLong());
			}
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
