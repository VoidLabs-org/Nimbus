package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import com.nimbus.api.mail.Mail;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class IdentityMailLayoutTests {

	@ParameterizedTest
	@ValueSource(strings = { "fallback", "logo" })
	void verificationEmailIsUnchanged(String variant) throws IOException {
		assertUnchanged("verification-" + variant, VerificationMail.to("ada@example.com", "482917",
				Duration.ofMinutes(15), logo(variant)));
	}

	@ParameterizedTest
	@ValueSource(strings = { "fallback", "logo" })
	void resetEmailIsUnchanged(String variant) throws IOException {
		assertUnchanged("reset-" + variant,
				ResetMail.to("ada@example.com", "123456", Duration.ofMinutes(15), logo(variant)));
	}

	@ParameterizedTest
	@ValueSource(strings = { "fallback", "logo" })
	void emailChangeCodeEmailMatchesTheSavedLayout(String variant) throws IOException {
		assertUnchanged("email-change-" + variant, EmailChangeMail.to("nadia@gmail.com", "482917",
				Duration.ofMinutes(15), logo(variant)));
	}

	@ParameterizedTest
	@ValueSource(strings = { "fallback", "logo" })
	void emailChangedEmailMatchesTheSavedLayout(String variant) throws IOException {
		assertUnchanged("email-changed-" + variant, EmailChangedMail.to("ada@example.com", "nadia@gmail.com",
				Instant.parse("2026-10-24T09:05:00Z"), logo(variant)));
	}

	@Test
	void aNewAddressWithoutAnAtSignIsHiddenEntirelyAndTheNoticeStillGoes() {
		var dots = String.valueOf((char) 0x2022).repeat(3);

		var mail = EmailChangedMail.to("ada@example.com", "nadia", Instant.parse("2026-10-24T09:05:00Z"),
				Optional.empty());

		assertThat(mail.text()).contains("The email on your account is now " + dots + ".").doesNotContain("nadia");
	}

	private static Optional<String> logo(String variant) {
		return variant.equals("logo") ? Optional.of("https://assets.example.dev/icon.png?a=1&b=2") : Optional.empty();
	}

	private static void assertUnchanged(String name, Mail mail) throws IOException {
		try (var stream = IdentityMailLayoutTests.class.getResourceAsStream("/mail/" + name + ".mail")) {
			assertThat(stream).as("saved email %s", name).isNotNull();
			assertThat(mail.toString())
				.isEqualTo(new String(stream.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n"));
		}
	}

}
