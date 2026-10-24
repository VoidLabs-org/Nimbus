package com.nimbus.api.identity.internal;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.nimbus.api.identity.TwoStepEnabled;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Two-step verification on the Security page: what the card shows, and turning it on. Setup is three calls: start
 * (a new key for the User's app), verify (a Sign-in code from the app proves it has the key, and the Recovery codes
 * are made) and turn on (both are stored). Starting needs a Session that began recently, so a stolen access token
 * alone can't put Two-step verification on someone else's phone and lock the User out.
 */
@Service
class TwoStep {

	static final int RECOVERY_CODES = 10;

	private static final String RECOVERY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

	private static final SecureRandom RANDOM = new SecureRandom();

	private final TwoStepStore store;

	private final TwoStepSetups setups;

	private final TwoStepSecrets secrets;

	private final UserRepository users;

	private final Sessions sessions;

	private final ApplicationEventPublisher events;

	private final Clock clock;

	private final Duration recentSignIn;

	private final TransactionTemplate transaction;

	private final SignInCodeLock lock;

	TwoStep(TwoStepStore store, TwoStepSetups setups, TwoStepSecrets secrets, UserRepository users, Sessions sessions,
			ApplicationEventPublisher events, Clock clock, AuthProperties properties,
			PlatformTransactionManager transactionManager, SignInCodeLock lock) {
		this.store = store;
		this.setups = setups;
		this.secrets = secrets;
		this.users = users;
		this.sessions = sessions;
		this.events = events;
		this.clock = clock;
		this.recentSignIn = properties.linkRecentSignIn();
		this.transaction = new TransactionTemplate(transactionManager);
		this.lock = lock;
	}

	Status status(UUID userId, UUID sessionId) {
		sessions.requireActive(sessionId, userId);
		return store.find(userId)
			.map(authenticator -> new Status(true, authenticator.enabledAt(), store.recoveryCodesLeft(userId)))
			.orElse(new Status(false, null, null));
	}

	/**
	 * A new key for the User's app, replacing any setup in progress.
	 *
	 * @throws AlreadyOnException when Two-step verification is on already
	 * @throws Sessions.ReauthRequiredException when the Session started too long ago
	 */
	SetupStarted startSetup(UUID userId, UUID sessionId) {
		sessions.requireActive(sessionId, userId);
		// What would fail anyway comes before asking for a new sign-in that would not help.
		if (store.find(userId).isPresent()) {
			throw new AlreadyOnException();
		}
		sessions.requireStartedWithin(sessionId, userId, recentSignIn);
		var key = SignInCodeMath.newKey();
		setups.start(userId, sessionId, key);
		var encoded = SignInCodeMath.base32(key);
		var label = URLEncoder.encode("Nimbus:" + users.require(userId).email(), StandardCharsets.UTF_8)
			.replace("+", "%20")
			.replace("%3A", ":");
		return new SetupStarted(encoded, "otpauth://totp/" + label + "?secret=" + encoded + "&issuer=Nimbus");
	}

	/**
	 * Checks a code from the User's app against the key being set up and makes the Recovery codes they are shown. A
	 * setup that is proved already answers with the codes it has, so a second tab or a double click never replaces
	 * the codes the User saved.
	 *
	 * @throws SetupExpiredException when this Session has no setup in progress, or the code was the last wrong one
	 * allowed
	 * @throws WrongSignInCodeException when the code doesn't fit the key
	 * @throws SlidingWindowLimiter.LimitExceededException when the User got too many codes wrong in the last hour
	 */
	List<String> verifySetup(UUID userId, UUID sessionId, String code) {
		sessions.requireActive(sessionId, userId);
		var setup = setups.find(userId, sessionId).orElseThrow(SetupExpiredException::new);
		var check = lock.check(userId);
		var step = SignInCodeMath.matchingStep(setup.key(), code, clock.instant(), null);
		if (step.isEmpty()) {
			if (setups.wrongCode(userId, setup)) {
				throw new SetupExpiredException();
			}
			throw new WrongSignInCodeException();
		}
		lock.right(userId, check);
		if (setup.isVerified()) {
			return setup.recoveryCodes();
		}
		var proved = setups.verified(userId, setup, step.getAsLong(), newRecoveryCodes());
		if (proved == null || !proved.isVerified()) {
			// Thrown away or replaced while this code was checked.
			throw new SetupExpiredException();
		}
		return proved.recoveryCodes();
	}

	/** Throws away the setup this Session has in progress, if any: the User closed the window. */
	void discardSetup(UUID userId, UUID sessionId) {
		sessions.requireActive(sessionId, userId);
		setups.discard(userId, sessionId);
	}

	/**
	 * Stores the proved setup: from now on the User has Two-step verification. Ends no Session.
	 *
	 * @throws AlreadyOnException when it is on already
	 * @throws SetupExpiredException when no proved setup is in progress
	 */
	void turnOn(UUID userId, UUID sessionId) {
		sessions.requireActive(sessionId, userId);
		transaction.executeWithoutResult(status -> {
			users.findLockedById(userId).orElseThrow();
			if (store.find(userId).isPresent()) {
				throw new AlreadyOnException();
			}
			var setup = setups.takeVerified(userId, sessionId).orElseThrow(SetupExpiredException::new);
			// Postgres keeps microseconds, so the time is cut to them before it is stored and announced.
			var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
			store.add(userId, secrets.encrypt(userId, setup.key()), now, setup.verifiedStep());
			store.replaceRecoveryCodes(userId, setup.recoveryCodes().stream()
				.map(code -> secrets.hashRecoveryCode(userId, normalise(code)))
				.toList());
			events.publishEvent(new TwoStepEnabled(userId, now));
		});
	}

	/**
	 * How a Recovery code is compared: capitals, spaces and dashes don't matter, including the tabs, no-break spaces
	 * and Unicode hyphens and dashes (and the minus sign) a code picks up when copied from a document.
	 */
	static String normalise(String recoveryCode) {
		return recoveryCode.toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Z}\\p{Pd}\\x{2212}]", "");
	}

	private static List<String> newRecoveryCodes() {
		var codes = new LinkedHashSet<String>();
		while (codes.size() < RECOVERY_CODES) {
			var code = new StringBuilder(9);
			for (var i = 0; i < 8; i++) {
				if (i == 4) {
					code.append('-');
				}
				code.append(RECOVERY_ALPHABET.charAt(RANDOM.nextInt(RECOVERY_ALPHABET.length())));
			}
			codes.add(code.toString());
		}
		return List.copyOf(codes);
	}

	/**
	 * @param enabledAt null when off
	 * @param recoveryCodesLeft null when off
	 */
	record Status(boolean enabled, Instant enabledAt, Integer recoveryCodesLeft) {
	}

	/**
	 * @param key base32, for typing into the app
	 * @param otpauthUri what the QR code holds
	 */
	record SetupStarted(String key, String otpauthUri) {
	}

	static class AlreadyOnException extends RuntimeException {

		AlreadyOnException() {
			super("Two-step verification is already on");
		}

	}

	static class SetupExpiredException extends RuntimeException {

		SetupExpiredException() {
			super("This setup has expired. Start again.");
		}

	}

	static class WrongSignInCodeException extends RuntimeException {

		private final Integer triesLeft;

		WrongSignInCodeException() {
			this(null);
		}

		/** @param triesLeft for a pending sign-in; null where the tries aren't counted down */
		WrongSignInCodeException(Integer triesLeft) {
			super("That code didn't work. Check your authenticator app and try again.");
			this.triesLeft = triesLeft;
		}

		Integer triesLeft() {
			return triesLeft;
		}

	}

}
