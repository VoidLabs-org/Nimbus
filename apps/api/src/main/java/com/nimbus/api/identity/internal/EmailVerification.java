package com.nimbus.api.identity.internal;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Proves a User owns their email with a Verification code: 6 digits, valid for 15 minutes, one live code per User
 * (a new one replaces the old), cancelled after 5 wrong tries. Only a keyed hash of the code is stored. The code
 * is mailed through {@link Mailer} directly, after the transaction that stored it has committed, and never goes
 * into a domain event: events are stored, so the code would sit in the database in plain text.
 */
@Service
class EmailVerification {

	private static final Logger log = LoggerFactory.getLogger(EmailVerification.class);

	static final Duration CODE_LIFETIME = Duration.ofMinutes(15);

	static final int MAX_WRONG_TRIES = 5;

	private static final int CODE_DIGITS = 6;

	private static final SecureRandom RANDOM = new SecureRandom();

	private final UserRepository users;

	private final VerificationCodeRepository codes;

	private final Mailer mailer;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	private final TransactionTemplate transaction;

	private final SecretKeySpec hashKey;

	EmailVerification(UserRepository users, VerificationCodeRepository codes, Mailer mailer, Clock clock,
			ApplicationEventPublisher events, PlatformTransactionManager transactionManager, SecretKey jwtKey) {
		this.users = users;
		this.codes = codes;
		this.mailer = mailer;
		this.clock = clock;
		this.events = events;
		this.transaction = new TransactionTemplate(transactionManager);
		// A key of its own, derived from the signing key, so a signed token can never be mistaken for a code hash.
		this.hashKey = new SecretKeySpec(hmac(jwtKey, "nimbus:verification-code".getBytes(StandardCharsets.UTF_8)),
				"HmacSHA256");
	}

	/**
	 * Issues a code for a User who has just registered and mails it. Registration has already succeeded, so
	 * nothing that goes wrong here is allowed to undo it: the failure is logged, and the User can ask for
	 * another code.
	 */
	void issueAfterSignUp(User user) {
		try {
			issueAndSend(user);
		}
		catch (RuntimeException e) {
			log.warn("Could not send a Verification code to user {}", user.getId(), e);
		}
	}

	private void issueAndSend(User user) {
		var code = newCode();
		var now = clock.instant();
		var hash = hash(user.getId(), code);
		transaction.executeWithoutResult(status -> {
			// The User's row serialises everything that changes their code.
			users.findLockedById(user.getId()).orElseThrow();
			var existing = codes.findLockedByUserId(user.getId());
			if (existing.isPresent()) {
				existing.get().replaceWith(hash, now, now.plus(CODE_LIFETIME));
			}
			else {
				codes.save(new VerificationCode(user.getId(), hash, now, now.plus(CODE_LIFETIME)));
			}
		});
		mailer.send(VerificationMail.to(user.email(), code, CODE_LIFETIME));
	}

	/**
	 * Marks the User's email verified when {@code code} is right, and publishes {@link EmailVerified}. A User who
	 * is already verified is left alone. A wrong try is counted even though it fails, so the counting is committed
	 * before the failure is reported.
	 *
	 * @throws WrongCodeException when the code is wrong and tries are left
	 * @throws CodeExpiredException when there is no live code: expired, never issued, or cancelled, which the
	 * fifth wrong try itself does
	 */
	User verify(UUID userId, String code) {
		var outcome = transaction.execute(status -> {
			var user = users.findLockedById(userId).orElseThrow(
					() -> new InvalidBearerTokenException("The User for this token no longer exists"));
			if (user.emailVerified()) {
				return new Outcome(user, 0, true);
			}
			var stored = codes.findLockedByUserId(userId).orElse(null);
			if (stored == null || stored.isExpiredAt(clock.instant())) {
				return new Outcome(user, -1, false);
			}
			if (matches(stored.codeHash(), hash(userId, code))) {
				codes.delete(stored);
				user.verifyEmail();
				events.publishEvent(new EmailVerified(user.getId(), user.email()));
				return new Outcome(user, 0, true);
			}
			stored.countWrongTry();
			var left = MAX_WRONG_TRIES - stored.wrongTries();
			if (left <= 0) {
				codes.delete(stored);
				return new Outcome(user, -1, false);
			}
			return new Outcome(user, left, false);
		});
		if (outcome.verified()) {
			return outcome.user();
		}
		if (outcome.triesLeft() < 0) {
			throw new CodeExpiredException();
		}
		throw new WrongCodeException(outcome.triesLeft());
	}

	private record Outcome(User user, int triesLeft, boolean verified) {
	}

	private static String newCode() {
		return String.format("%06d", RANDOM.nextInt(1_000_000));
	}

	private String hash(UUID userId, String code) {
		return HexFormat.of().formatHex(hmac(hashKey, (userId + ":" + code).getBytes(StandardCharsets.UTF_8)));
	}

	private static boolean matches(String storedHash, String givenHash) {
		return MessageDigest.isEqual(storedHash.getBytes(StandardCharsets.UTF_8),
				givenHash.getBytes(StandardCharsets.UTF_8));
	}

	private static byte[] hmac(SecretKey key, byte[] data) {
		try {
			var mac = Mac.getInstance("HmacSHA256");
			mac.init(key);
			return mac.doFinal(data);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

	/** The code was wrong; the User may try again {@code triesLeft} more times. */
	static class WrongCodeException extends RuntimeException {

		private final int triesLeft;

		WrongCodeException(int triesLeft) {
			super("That code is wrong");
			this.triesLeft = triesLeft;
		}

		int triesLeft() {
			return triesLeft;
		}

	}

	/** There is no live code: it expired, was cancelled after too many wrong tries, or was never issued. */
	static class CodeExpiredException extends RuntimeException {

		CodeExpiredException() {
			super("That code has expired. Ask for a new one.");
		}

	}

}
