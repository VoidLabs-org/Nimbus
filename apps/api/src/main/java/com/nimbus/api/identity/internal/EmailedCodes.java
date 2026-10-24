package com.nimbus.api.identity.internal;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/**
 * The short codes Nimbus emails to prove a User owns their address, of one {@link Kind}: 6 random digits, valid
 * for 15 minutes, one live code per User and kind (a new one replaces the old), cancelled after 5 wrong tries.
 * Only a keyed hash of a code is stored, bound to its User, and hashes are compared in constant time. Each kind
 * hashes with a key of its own, and keeps its own rows, so a pending code of one kind never replaces another.
 *
 * <p>The methods that touch codes run inside the caller's transaction, which must hold the User's row lock
 * ({@code UserRepository.findLockedById}); the code's own row is locked as well, so parallel tries are counted
 * one after the other. Mailing the code is the caller's job, after the commit: a code never goes into an event,
 * because events are stored and it would sit in the database in plain text.
 */
final class EmailedCodes {

	enum Kind {

		VERIFICATION("nimbus:verification-code"), RESET("nimbus:reset-code"),

		/** A Verification code mailed to a new address, which becomes the User's email once it is entered. */
		EMAIL_CHANGE("nimbus:email-change-code");

		private final String hashPurpose;

		Kind(String hashPurpose) {
			this.hashPurpose = hashPurpose;
		}

	}

	static final Duration LIFETIME = Duration.ofMinutes(15);

	static final int MAX_WRONG_TRIES = 5;

	private static final SecureRandom RANDOM = new SecureRandom();

	private final Kind kind;

	private final EmailedCodeRepository codes;

	private final Clock clock;

	private final SecretKeySpec hashKey;

	/**
	 * @param signingKey the hash key is derived from it and the kind, so a signed token can never be mistaken for a
	 * code hash, nor one kind of code for another
	 */
	EmailedCodes(Kind kind, SecretKey signingKey, EmailedCodeRepository codes, Clock clock) {
		this.kind = kind;
		this.codes = codes;
		this.clock = clock;
		this.hashKey = new SecretKeySpec(hmac(signingKey, kind.hashPurpose.getBytes(StandardCharsets.UTF_8)),
				"HmacSHA256");
	}

	/** Stores a new code for the User, replacing any live one, and returns it, to be mailed after the commit. */
	String issue(UUID userId) {
		return issue(userId, null);
	}

	/**
	 * Like {@link #issue(UUID)}, for an email change: the code is kept with the address it was mailed to, which
	 * {@link #newEmail} reads back.
	 */
	String issue(UUID userId, String newEmail) {
		var code = String.format("%06d", RANDOM.nextInt(1_000_000));
		var hash = hash(userId, code);
		// Postgres keeps microseconds and rounds anything finer, which could push a stored expiry past the instant
		// it should end at, so the time is cut to microseconds first.
		var now = clock.instant().truncatedTo(ChronoUnit.MICROS);
		var existing = codes.findLocked(userId, kind);
		if (existing.isPresent()) {
			existing.get().replaceWith(hash, now, now.plus(LIFETIME), newEmail);
		}
		else {
			codes.save(new EmailedCode(userId, kind, hash, now, now.plus(LIFETIME), newEmail));
		}
		return code;
	}

	/** The address the User's live email-change code was mailed to, if they have one. */
	Optional<String> newEmail(UUID userId) {
		return codes.findLocked(userId, kind)
			.filter(stored -> !stored.isExpiredAt(clock.instant()))
			.map(EmailedCode::newEmail);
	}

	/**
	 * Checks {@code code} against the User's live code. A right code is used up. A wrong one is counted, and the
	 * fifth cancels the code. The count is part of the caller's transaction, so the caller must commit it before
	 * reporting {@link Check#failure()}.
	 */
	Check check(UUID userId, String code) {
		var stored = codes.findLocked(userId, kind).orElse(null);
		if (stored == null || stored.isExpiredAt(clock.instant())) {
			return Check.NONE;
		}
		if (matches(stored.codeHash(), hash(userId, code))) {
			codes.delete(stored);
			return Check.RIGHT;
		}
		stored.countWrongTry();
		var left = MAX_WRONG_TRIES - stored.wrongTries();
		if (left <= 0) {
			codes.delete(stored);
			return Check.NONE;
		}
		return new Check.Wrong(left);
	}

	/** Cancels the User's code, if any: its job is done some other way. */
	void discard(UUID userId) {
		codes.findLocked(userId, kind).ifPresent(codes::delete);
	}

	/** What {@link #check} found: a right code, no live code, or a wrong one with some tries left. */
	sealed interface Check {

		Check RIGHT = new Right();

		/** Expired, never issued, or cancelled, which the fifth wrong try itself does. */
		Check NONE = new None();

		default boolean isRight() {
			return this instanceof Right;
		}

		/** The error that tells the caller's client why the code didn't work; not for a right code. */
		default RuntimeException failure() {
			return switch (this) {
				case Right right -> throw new IllegalStateException("The code was right");
				case None none -> new CodeExpiredException();
				case Wrong wrong -> new WrongCodeException(wrong.triesLeft());
			};
		}

		record Right() implements Check {
		}

		record None() implements Check {
		}

		record Wrong(int triesLeft) implements Check {
		}

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
