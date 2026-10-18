package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Optional;

import com.nimbus.api.mail.Mail;
import org.junit.jupiter.api.Test;

class VerificationMailTests {

	private static final Duration LIFETIME = Duration.ofMinutes(15);

	private static Mail mail(Optional<String> logoUrl) {
		return VerificationMail.to("ada@example.com", "482917", LIFETIME, logoUrl);
	}

	@Test
	void theCodeIsInLargeTypeInTheHtmlAndInThePlainText() {
		var mail = mail(Optional.empty());

		assertThat(mail.to()).isEqualTo("ada@example.com");
		assertThat(mail.html()).contains(">482917<").contains("font-size:44px");
		assertThat(mail.text()).contains("482917")
			.contains("Enter this in Nimbus to verify your email. It expires in 15 minutes.");
		assertThat(mail.html()).contains("Enter this in Nimbus to verify your email. It expires in 15 minutes.");
	}

	@Test
	void theCodeIsIntroducedInPlainWordsRightBeforeIt() {
		// Gmail's "Copy code" card seems to read the text layout, so the sentence and the number sit together.
		var html = mail(Optional.empty()).html().replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ");

		assertThat(html).contains("Your verification code is 482917");
	}

	@Test
	void theCodeStaysOutOfTheSubjectAndThePreview() {
		var mail = mail(Optional.empty());

		assertThat(mail.subject()).doesNotContain("482917");
		// The title and the hidden preview line show in inbox lists and on lock screens.
		assertThat(mail.html()).containsOnlyOnce("482917");
	}

	@Test
	void theHeaderShowsTheHostedLogoWithFixedSizeAndAltText() {
		var html = mail(Optional.of("https://assets.example.dev/nimbus-icon-dark.png")).html();

		assertThat(html).contains("<img src=\"https://assets.example.dev/nimbus-icon-dark.png\"")
			.contains("width=\"28\"")
			.contains("height=\"28\"")
			.contains("alt=\"Nimbus\"");
	}

	@Test
	void withoutALogoUrlTheHeaderFallsBackToTheOrangeCircle() {
		var html = mail(Optional.empty()).html();

		assertThat(html).doesNotContain("<img").contains("nimbus").contains("background:#ff6b3d");
	}

	@Test
	void noPlaceholderLinksOrAddressesAreSent() {
		var html = mail(Optional.empty()).html();

		assertThat(html).doesNotContain("example.com").doesNotContain("[Postal address]");
	}

}
