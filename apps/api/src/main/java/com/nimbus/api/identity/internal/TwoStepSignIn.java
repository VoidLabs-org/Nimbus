package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.identity.RecoveryCodeUsed;
import com.nimbus.api.identity.internal.SlidingWindowLimiter.LimitExceededException;
import org.springframework.context.ApplicationEventPublisher;
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
 * Recovery codes instead, which then is used up. A refresh never comes here. A browser where the User ticked "Don't
 * ask again on this device for 30 days" ({@link RememberedBrowsers}) skips the second step.
 */
@Service
class TwoStepSignIn {

	private final PendingSignIns pending;

	private final SignInCodeLock lock;

	private final TwoStepStore store;

	private final UserRepository users;

	private final Clock clock;

	private final TransactionTemplate transaction;

	private final ApplicationEventPublisher events;

	private final Sessions sessions;

	private final ExternalSignIn externalSignIn;

	private final SignInCodeCheck codeCheck;

	private final RememberedBrowsers rememberedBrowsers;

	TwoStepSignIn(PendingSignIns pending, SignInCodeLock lock, TwoStepStore store, UserRepository users,
			Clock clock, PlatformTransactionManager transactionManager, ApplicationEventPublisher events,
			Sessions sessions, ExternalSignIn externalSignIn, SignInCodeCheck codeCheck,
			RememberedBrowsers rememberedBrowsers) {
		this.pending = pending;
		this.lock = lock;
		this.store = store;
		this.users = users;
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
		this.events = events;
		this.sessions = sessions;
		this.externalSignIn = externalSignIn;
		this.codeCheck = codeCheck;
		this.rememberedBrowsers = rememberedBrowsers;
	}

	/**
	 * Starts the second step when {@code user}, whom a provider's {@code profile} signs in as (null for a password
	 * sign-in), has Two-step verification. Nothing of the profile is stored until the code is right.
	 *
	 * @param rememberedToken the browser's {@link RememberedBrowsers#COOKIE} (the Mobile app's {@code rememberedToken}),
	 * or null: when it remembers this User's browser, no code is needed
	 * @return the pending sign-in's id, for its cookie ({@link PendingSignIns#cookie}) or the Mobile app's
	 * {@code pendingToken}; empty when no code is needed and the sign-in can go ahead now
	 */
	Optional<String> begin(User user, ExternalProfile profile, String rememberedToken) {
		if (store.find(user.getId()).isEmpty() || rememberedBrowsers.isRemembered(user.getId(), rememberedToken)) {
			return Optional.empty();
		}
		return Optional.of(pending.start(user.getId(), user.passwordHash(), profile));
	}

	/**
	 * Checks a Sign-in code, or a Recovery code, for the pending sign-in and, when it is right, ends that pending
	 * sign-in and starts the Session. A right Recovery code is marked used and publishes {@link RecoveryCodeUsed}. All
	 * of it is one transaction, so a Session that fails to start gives back the code and the pending sign-in.
	 *
	 * @param pendingId from the cookie (the Mobile app's {@code pendingToken}), or null when there was none
	 * @param code the Sign-in code; ignored when {@code recoveryCode} is given
	 * @param recoveryCode a Recovery code, compared with capitals, spaces and dashes ignored; null or blank for a
	 * Sign-in code
	 * @param rememberBrowser "Don't ask again on this device for 30 days": a right code also remembers this browser
	 * @param userAgent the browser's {@code User-Agent}, kept with the Session as at sign-in; may be null
	 * @throws SignInExpiredException when the pending sign-in is missing, unknown, used or expired, the User's
	 * password changed since a password sign-in started, the provider of a provider sign-in no longer signs in as the
	 * User (disconnected, or the account is someone else's now), or this was its last wrong code allowed
	 * @throws TwoStep.WrongSignInCodeException when the code is wrong (a Recovery code also when it was used), with
	 * the tries left
	 * @throws LimitExceededException when the User got too many codes wrong in the last hour
	 */
	SignedIn finish(String pendingId, String code, String recoveryCode, boolean rememberBrowser, String userAgent) {
		var found = pending.find(pendingId).orElseThrow(SignInExpiredException::new);
		var userId = found.userId();
		// A User over the lock is refused before their row is locked.
		lock.requireUnder(userId);
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
			// Postgres keeps microseconds, so the time is cut to them before it is stored and announced.
			var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
			var answer = codeCheck.useEither(userId, authenticator, code, recoveryCode, now);
			if (!answer.right()) {
				var triesLeft = pending.wrongCode(pendingId);
				if (triesLeft == 0) {
					throw new SignInExpiredException();
				}
				throw new TwoStep.WrongSignInCodeException(triesLeft);
			}
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
			if (answer.usedRecoveryCode()) {
				events.publishEvent(new RecoveryCodeUsed(userId, now, answer.recoveryCodesLeft()));
			}
			// Only now is the provider sign-in stored (the link, the avatar): it waited for the code.
			if (found.profile() != null && !externalSignIn.signIn(found.profile()).getId().equals(userId)) {
				throw new SignInExpiredException();
			}
			// Join this transaction, so they are stored with the used code or not at all.
			var remembered = rememberBrowser ? rememberedBrowsers.remember(userId) : null;
			return new SignedIn(user, sessions.start(user, userAgent, true), remembered);
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

	/**
	 * @param token the new Session's first refresh token
	 * @param rememberedToken for the {@link RememberedBrowsers#COOKIE} cookie (the Mobile app's {@code rememberedToken});
	 * null when the browser wasn't remembered
	 */
	record SignedIn(User user, Sessions.IssuedToken token, String rememberedToken) {
	}

	/** Becomes a 401 with {@code code: sign_in_expired} that also clears the pending cookie. */
	static class SignInExpiredException extends RuntimeException {

		SignInExpiredException() {
			super("Your sign-in timed out. Sign in again.");
		}

	}

}
