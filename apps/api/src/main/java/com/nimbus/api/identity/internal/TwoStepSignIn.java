package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.identity.RecoveryCodeUsed;
import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The second step of signing in for a User with Two-step verification: after the password, or after Google or
 * GitHub, a pending sign-in waits for a Sign-in code from the User's app, and only a right one lets a Session start.
 * A provider sign-in stores nothing (no link, no avatar) until then. A code is accepted once: the step
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

	private final Sessions sessions;

	private final ExternalSignIn externalSignIn;

	TwoStepSignIn(PendingSignIns pending, SignInCodeLock lock, TwoStepStore store, TwoStepSecrets secrets,
			UserRepository users, Clock clock, PlatformTransactionManager transactionManager,
			ApplicationEventPublisher events, Sessions sessions, ExternalSignIn externalSignIn) {
		this.pending = pending;
		this.lock = lock;
		this.store = store;
		this.secrets = secrets;
		this.users = users;
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
		this.events = events;
		this.sessions = sessions;
		this.externalSignIn = externalSignIn;
	}

	/**
	 * Starts the second step when {@code user}, who just proved their password, has Two-step verification.
	 *
	 * @return the pending sign-in's cookie; empty when no code is needed and the Session can start now
	 */
	Optional<ResponseCookie> begin(User user) {
		return begin(user, null);
	}

	/**
	 * Starts the second step when {@code user}, whom a provider's {@code profile} signs in as, has Two-step
	 * verification. Nothing of the profile is stored until the code is right.
	 *
	 * @return the pending sign-in's cookie; empty when no code is needed and the sign-in can go ahead now
	 */
	Optional<ResponseCookie> begin(User user, ExternalProfile profile) {
		if (store.find(user.getId()).isEmpty()) {
			return Optional.empty();
		}
		return Optional.of(PendingSignIns.cookie(pending.start(user.getId(), user.passwordHash(), profile)));
	}

	/**
	 * Checks a Sign-in code, or a Recovery code, for the pending sign-in and, when it is right, ends that pending
	 * sign-in and starts the Session. A right Recovery code is marked used and publishes {@link RecoveryCodeUsed}. All
	 * of it is one transaction, so a Session that fails to start gives back the code and the pending sign-in.
	 *
	 * @param pendingId from the cookie, or null when there was none
	 * @param code the Sign-in code; ignored when {@code recoveryCode} is given
	 * @param recoveryCode a Recovery code, compared with capitals, spaces and dashes ignored; null or blank for a
	 * Sign-in code
	 * @param userAgent the browser's {@code User-Agent}, kept with the Session as at sign-in; may be null
	 * @throws SignInExpiredException when the pending sign-in is missing, unknown, used or expired, the User's
	 * password changed since a password sign-in started, the provider of a provider sign-in no longer signs in as the
	 * User (disconnected, or the account is someone else's now), or this was its last wrong code allowed
	 * @throws TwoStep.WrongSignInCodeException when the code is wrong (a Recovery code also when it was used), with
	 * the tries left
	 * @throws LimitExceededException when the User got too many codes wrong in the last hour
	 */
	SignedIn finish(String pendingId, String code, String recoveryCode, String userAgent) {
		var usesRecoveryCode = recoveryCode != null && !recoveryCode.isBlank();
		var found = pending.find(pendingId).orElseThrow(SignInExpiredException::new);
		var userId = found.userId();
		return transaction.execute(status -> {
			// Locked, so two requests can't both sign in with one code.
			var user = users.findLockedById(userId).orElseThrow(SignInExpiredException::new);
			// A password change or reset ends what the old password started; a provider must still sign in as the User.
			if (found.profile() == null ? !Objects.equals(user.passwordHash(), found.passwordHash())
					: !providerStillSignsIn(found.profile(), userId)) {
				pending.end(pendingId);
				throw new SignInExpiredException();
			}
			var authenticator = store.find(userId).orElseThrow(SignInExpiredException::new);
			// Only a Sign-in code needs the key: a Recovery code still works when the key can't be read.
			var key = usesRecoveryCode ? null : secrets.decrypt(userId, authenticator.encryptedKey());
			// Counted only now, so failures that are not about the code never use up the User's hour.
			var check = lock.check(userId);
			// Postgres keeps microseconds, so the time is cut to them before it is stored and announced.
			var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
			var step = usesRecoveryCode ? null
					: SignInCodeMath.matchingStep(key, code, now, authenticator.lastUsedStep());
			var codesLeft = usesRecoveryCode
					? store.useRecoveryCode(userId, secrets.hashRecoveryCode(userId, TwoStep.normalise(recoveryCode)),
							now)
					: null;
			var right = usesRecoveryCode ? codesLeft.isPresent() : step.isPresent();
			if (!right) {
				var triesLeft = pending.wrongCode(pendingId);
				if (triesLeft == 0) {
					throw new SignInExpiredException();
				}
				throw new TwoStep.WrongSignInCodeException(triesLeft);
			}
			lock.right(userId, check);
			var taken = pending.take(pendingId).orElseThrow(SignInExpiredException::new);
			// Taken now, under the lock, so no other request can use it; given back if the Session doesn't start.
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCompletion(int outcome) {
					if (outcome != STATUS_COMMITTED) {
						pending.putBack(pendingId, taken);
					}
				}
			});
			if (usesRecoveryCode) {
				events.publishEvent(new RecoveryCodeUsed(userId, now, codesLeft.getAsInt()));
			}
			else {
				store.useStep(userId, step.getAsLong());
			}
			// Only now is the provider sign-in stored (the link, the avatar): it waited for the code.
			if (found.profile() != null && !externalSignIn.signIn(found.profile()).getId().equals(userId)) {
				throw new SignInExpiredException();
			}
			// Joins this transaction, so it is stored with the used code or not at all.
			return new SignedIn(user, sessions.start(user, userAgent));
		});
	}

	private boolean providerStillSignsIn(ExternalProfile profile, UUID userId) {
		try {
			return externalSignIn.whoSignsIn(profile).map(User::getId).filter(userId::equals).isPresent();
		}
		catch (ExternalSignIn.ProviderDisconnectedException | ExternalSignIn.EmailUnverifiedException e) {
			return false;
		}
	}

	/** @param token the new Session's first refresh token */
	record SignedIn(User user, Sessions.IssuedToken token) {
	}

	/** Becomes a 401 with {@code code: sign_in_expired} that also clears the pending cookie. */
	static class SignInExpiredException extends RuntimeException {

		SignInExpiredException() {
			super("Your sign-in timed out. Sign in again.");
		}

	}

}
