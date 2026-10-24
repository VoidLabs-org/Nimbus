package com.nimbus.api.identity.internal;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

/**
 * Everything Two-step verification keeps secret, keyed from TWO_STEP_SECRET: authenticator keys are stored encrypted
 * (AES-GCM, bound to their User so a row can't be moved to another), and Recovery codes only as keyed hashes. The
 * app refuses to start without a usable secret.
 */
@Component
class TwoStepSecrets {

	static final String HINT = "TWO_STEP_SECRET must be base64 of at least 32 bytes; generate one with: openssl rand -base64 32";

	private static final int IV_BYTES = 12;

	private static final int TAG_BITS = 128;

	private static final SecureRandom RANDOM = new SecureRandom();

	private final SecretKeySpec encryptionKey;

	private final SecretKeySpec hashKey;

	TwoStepSecrets(AuthProperties properties) {
		// A missing value is normally stopped earlier by @NotBlank; here it is just one more too-short secret.
		var configured = Objects.requireNonNullElse(properties.twoStepSecret(), "");
		byte[] secret;
		try {
			secret = Base64.getDecoder().decode(configured.strip());
		}
		catch (IllegalArgumentException e) {
			throw new IllegalStateException(HINT, e);
		}
		if (secret.length < 32) {
			throw new IllegalStateException(HINT);
		}
		// One secret, two keys for two purposes, so neither use can be turned against the other.
		this.encryptionKey = new SecretKeySpec(hmac(secret, "nimbus:two-step-key"), "AES");
		this.hashKey = new SecretKeySpec(hmac(secret, "nimbus:recovery-code"), "HmacSHA256");
	}

	/** The IV followed by the ciphertext and tag. */
	byte[] encrypt(UUID userId, byte[] authenticatorKey) {
		var iv = new byte[IV_BYTES];
		RANDOM.nextBytes(iv);
		try {
			var cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, encryptionKey, new GCMParameterSpec(TAG_BITS, iv));
			cipher.updateAAD(bytesOf(userId));
			var sealed = cipher.doFinal(authenticatorKey);
			return ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array();
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException("Could not encrypt an authenticator key", e);
		}
	}

	byte[] decrypt(UUID userId, byte[] stored) {
		try {
			var cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, encryptionKey, new GCMParameterSpec(TAG_BITS, stored, 0, IV_BYTES));
			cipher.updateAAD(bytesOf(userId));
			return cipher.doFinal(stored, IV_BYTES, stored.length - IV_BYTES);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(
					"Could not decrypt the authenticator key of user " + userId + ": was TWO_STEP_SECRET changed?", e);
		}
	}

	/** The keyed hash stored for a Recovery code, already normalised, bound to its User. */
	String hashRecoveryCode(UUID userId, String normalisedCode) {
		try {
			var mac = Mac.getInstance("HmacSHA256");
			mac.init(hashKey);
			mac.update(bytesOf(userId));
			return HexFormat.of().formatHex(mac.doFinal(normalisedCode.getBytes(StandardCharsets.UTF_8)));
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException("HmacSHA256 is not available", e);
		}
	}

	private static byte[] hmac(byte[] key, String purpose) {
		try {
			var mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(key, "HmacSHA256"));
			return mac.doFinal(purpose.getBytes(StandardCharsets.UTF_8));
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException("HmacSHA256 is not available", e);
		}
	}

	private static byte[] bytesOf(UUID id) {
		return ByteBuffer.allocate(16).putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits())
			.array();
	}

}
