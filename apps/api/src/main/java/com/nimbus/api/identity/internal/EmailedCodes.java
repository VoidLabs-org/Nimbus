package com.nimbus.api.identity.internal;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

/**
 * The short codes Nimbus emails to prove a User owns their address (Verification codes, Reset codes): 6 random
 * digits, valid for 15 minutes, cancelled after 5 wrong tries. Only a keyed hash of a code is stored, bound to its
 * User, and hashes are compared in constant time. Each kind of code hashes with a key of its own.
 */
final class EmailedCodes {

	static final Duration LIFETIME = Duration.ofMinutes(15);

	static final int MAX_WRONG_TRIES = 5;

	private static final SecureRandom RANDOM = new SecureRandom();

	private final SecretKeySpec hashKey;

	/**
	 * @param purpose names the kind of code; the hash key is derived from the signing key and it, so a signed
	 * token can never be mistaken for a code hash, nor one kind of code for another
	 */
	EmailedCodes(SecretKey signingKey, String purpose) {
		this.hashKey = new SecretKeySpec(hmac(signingKey, purpose.getBytes(StandardCharsets.UTF_8)), "HmacSHA256");
	}

	static String newCode() {
		return String.format("%06d", RANDOM.nextInt(1_000_000));
	}

	/**
	 * The time to issue a code at. Postgres keeps microseconds and rounds anything finer, which could push a stored
	 * expiry past the instant it should end at, so the time is cut to microseconds first.
	 */
	static Instant issuedAt(Clock clock) {
		return clock.instant().truncatedTo(ChronoUnit.MICROS);
	}

	String hash(UUID userId, String code) {
		return HexFormat.of().formatHex(hmac(hashKey, (userId + ":" + code).getBytes(StandardCharsets.UTF_8)));
	}

	static boolean matches(String storedHash, String givenHash) {
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
