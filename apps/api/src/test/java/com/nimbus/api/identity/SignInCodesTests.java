package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

/** The test generator agrees with the published RFC 6238 examples, so the tests that use it can be trusted. */
class SignInCodesTests {

	// RFC 6238 appendix B, SHA-1 key "12345678901234567890"; the 8-digit values cut to the 6 an app shows.
	private static final byte[] RFC_KEY = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

	@Test
	void matchesTheRfcExamples() {
		assertThat(SignInCodes.codeAtStep(RFC_KEY, 59 / 30)).isEqualTo("287082");
		assertThat(SignInCodes.codeAtStep(RFC_KEY, 1111111109L / 30)).isEqualTo("081804");
		assertThat(SignInCodes.codeAtStep(RFC_KEY, 1234567890L / 30)).isEqualTo("005924");
	}

	@Test
	void readsTheKeyAsShownForTyping() {
		// "12345678901234567890" in base32, grouped in fours.
		assertThat(SignInCodes.decode("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ")).isEqualTo(RFC_KEY);
	}

}
