package com.nimbus.api.identity.internal;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.OptionalLong;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * The Sign-in codes an authenticator app shows: RFC 6238 time-based codes (HMAC-SHA1, 6 digits, 30-second steps)
 * from a 160-bit key, which the User's app gets as base32. Written here rather than taken from a library: it is a
 * few lines, and the tests check it against an independent generator.
 */
final class SignInCodeMath {

	static final int KEY_BYTES = 20;

	static final long STEP_SECONDS = 30;

	/** Codes for one step before and one after now are accepted too, for phone clocks that are a little off. */
	static final int DRIFT_STEPS = 1;

	private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

	private static final SecureRandom RANDOM = new SecureRandom();

	private SignInCodeMath() {
	}

	static byte[] newKey() {
		var key = new byte[KEY_BYTES];
		RANDOM.nextBytes(key);
		return key;
	}

	static long stepAt(Instant at) {
		return Math.floorDiv(at.getEpochSecond(), STEP_SECONDS);
	}

	/**
	 * The step {@code code} was made for, if it fits one within the drift of {@code at} and is newer than
	 * {@code lastUsedStep} (null when none was used yet); empty otherwise, including for anything that isn't 6 digits.
	 */
	static OptionalLong matchingStep(byte[] key, String code, Instant at, Long lastUsedStep) {
		if (code == null || !code.matches("\\d{6}")) {
			return OptionalLong.empty();
		}
		var now = stepAt(at);
		for (var step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
			var fits = MessageDigest.isEqual(codeAt(key, step).getBytes(), code.getBytes());
			if (fits && (lastUsedStep == null || step > lastUsedStep)) {
				return OptionalLong.of(step);
			}
		}
		return OptionalLong.empty();
	}

	static String codeAt(byte[] key, long step) {
		try {
			var mac = Mac.getInstance("HmacSHA1");
			mac.init(new SecretKeySpec(key, "HmacSHA1"));
			var hash = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(step).array());
			var offset = hash[hash.length - 1] & 0x0f;
			var truncated = ByteBuffer.wrap(hash, offset, Integer.BYTES).getInt() & 0x7fffffff;
			return String.format("%06d", truncated % 1_000_000);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException("HmacSHA1 is not available", e);
		}
	}

	/** Base32 without padding, as authenticator apps read keys (20 bytes give 32 characters). */
	static String base32(byte[] bytes) {
		var out = new StringBuilder();
		int buffer = 0;
		int bits = 0;
		for (var b : bytes) {
			buffer = (buffer << 8) | (b & 0xff);
			bits += 8;
			while (bits >= 5) {
				out.append(BASE32.charAt((buffer >> (bits - 5)) & 0x1f));
				bits -= 5;
			}
		}
		if (bits > 0) {
			out.append(BASE32.charAt((buffer << (5 - bits)) & 0x1f));
		}
		return out.toString();
	}

}
