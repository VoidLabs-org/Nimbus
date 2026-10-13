package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.stream.Stream;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The admin seed accepts exactly the email and password registration accepts, and an operator's mistake stops
 * startup with a message that names the setting. Only the checks run, never the creation of a User, so there is
 * no {@link Registration} to hand over.
 */
class AdminSeedValidationTests {

	private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

	@ParameterizedTest
	@MethodSource("emailsRegistrationRejects")
	void anEmailRegistrationWouldRejectStopsStartup(String email) {
		var seed = seed(email, "a good password");

		assertThatThrownBy(seed::validate).isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("NIMBUS_ADMIN_EMAIL");
	}

	@ParameterizedTest
	@MethodSource("passwordsRegistrationRejects")
	void aPasswordRegistrationWouldRejectStopsStartup(String password) {
		var seed = seed("root@example.com", password);

		assertThatThrownBy(seed::validate).isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("NIMBUS_ADMIN_PASSWORD").hasMessageContaining("8")
			.hasMessageContaining("128");
	}

	@Test
	void theMessageNeverRepeatsThePassword() {
		var seed = seed("root@example.com", "short");

		assertThatThrownBy(seed::validate).message().doesNotContain("short");
	}

	@ParameterizedTest
	@MethodSource("emailsRegistrationAccepts")
	void anEmailRegistrationAcceptsIsAccepted(String email) {
		assertThatCode(seed(email, "a good password")::validate).doesNotThrowAnyException();
	}

	@ParameterizedTest
	@MethodSource("passwordsRegistrationAccepts")
	void aPasswordRegistrationAcceptsIsAccepted(String password) {
		assertThatCode(seed("root@example.com", password)::validate).doesNotThrowAnyException();
	}

	static Stream<String> emailsRegistrationRejects() {
		return Stream.of("a@b@c.io", "no-at-sign.example.com", "two words@example.com", "@example.com", "ada@",
				"a".repeat(250) + "@example.com");
	}

	// "admin@localhost" has no dot: the old seed refused it, registration takes it, so the seed does too.
	static Stream<String> emailsRegistrationAccepts() {
		var longest = "a".repeat(64) + "@" + "b".repeat(63) + "." + "b".repeat(63) + "." + "b".repeat(61);
		return Stream.of("root@example.com", "admin@localhost", "first.last+tag@sub.example.co.uk", longest);
	}

	static Stream<String> passwordsRegistrationAccepts() {
		return Stream.of("12345678", "x".repeat(128), "pass word with spaces", "päss wörd");
	}

	static Stream<String> passwordsRegistrationRejects() {
		return Stream.of("short", "1234567", "x".repeat(129));
	}

	private static AdminSeed seed(String email, String password) {
		return new AdminSeed(null, VALIDATOR, email, password);
	}

}
