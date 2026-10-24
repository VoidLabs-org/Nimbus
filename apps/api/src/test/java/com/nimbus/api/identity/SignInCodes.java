package com.nimbus.api.identity;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Makes the Sign-in code an authenticator app would show for a key, the way the app does it (RFC 6238: HMAC-SHA1,
 * 30-second steps, 6 digits), written apart from the code under test so the two can disagree.
 */
public final class SignInCodes {

	private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

	private SignInCodes() {
	}

	/** The code for {@code key} (base32, as shown for typing; spaces ignored) at {@code at}. */
	public static String codeFor(String key, Instant at) {
		return codeAtStep(decode(key), Math.floorDiv(at.getEpochSecond(), 30));
	}

	static String codeAtStep(byte[] key, long step) {
		try {
			var mac = Mac.getInstance("HmacSHA1");
			mac.init(new SecretKeySpec(key, "HmacSHA1"));
			var hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
			var offset = hash[hash.length - 1] & 0x0f;
			var binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16)
					| ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
			return String.format("%06d", binary % 1_000_000);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

	static byte[] decode(String key) {
		var clean = key.replace(" ", "").toUpperCase(Locale.ROOT);
		var out = ByteBuffer.allocate(clean.length() * 5 / 8);
		int buffer = 0;
		int bits = 0;
		for (var c : clean.toCharArray()) {
			var value = BASE32.indexOf(c);
			if (value < 0) {
				throw new IllegalArgumentException("not base32: " + c);
			}
			buffer = (buffer << 5) | value;
			bits += 5;
			if (bits >= 8) {
				out.put((byte) (buffer >> (bits - 8)));
				bits -= 8;
			}
		}
		return out.array();
	}

}
