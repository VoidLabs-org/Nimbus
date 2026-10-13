package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.stream.Stream;

import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The admin seed accepts exactly the email and password registration accepts, and an operator's mistake stops
 * startup with a message that names the setting. Every case here fails before any User is created, so there is
 * no {@link Registration} to hand over.
 */
class AdminSeedValidationTests {

	@ParameterizedTest
	@MethodSource("emailsRegistrationRejects")
	void anEmailRegistrationWouldRejectStopsStartup(String email) {
		var seed = seed(email, "a good password");

		assertThatThrownBy(() -> seed.run(null)).isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("NIMBUS_ADMIN_EMAIL");
	}

	@ParameterizedTest
	@MethodSource("passwordsRegistrationRejects")
	void aPasswordRegistrationWouldRejectStopsStartup(String password) {
		var seed = seed("root@example.com", password);

		assertThatThrownBy(() -> seed.run(null)).isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("NIMBUS_ADMIN_PASSWORD").hasMessageContaining("8")
			.hasMessageContaining("128");
	}

	@Test
	void theMessageNeverRepeatsThePassword() {
		var seed = seed("root@example.com", "short");

		assertThatThrownBy(() -> seed.run(null)).message().doesNotContain("short");
	}

	static Stream<String> emailsRegistrationRejects() {
		return Stream.of("a@b@c.io", "no-at-sign.example.com", "two words@example.com", "@example.com", "ada@",
				"a".repeat(250) + "@example.com");
	}

	static Stream<String> passwordsRegistrationRejects() {
		return Stream.of("short", "1234567", "x".repeat(129));
	}

	private static AdminSeed seed(String email, String password) {
		var validator = Validation.buildDefaultValidatorFactory().getValidator();
		return new AdminSeed(null, validator, email, password);
	}

}
