package com.nimbus.api.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MailFrameTests {

	@Test
	void callersCanStyleTheirOwnCardsOnSmallScreensWithoutIdentityRules() {
		var html = MailFrame.html("Title", "Preview", "Heading", Optional.empty(), "<p class=\"project\">Card</p>",
				"Footer", ".project{font-size:18px!important}");

		assertThat(html)
			.contains("@media (max-width:620px){.px{padding-left:24px!important;padding-right:24px!important}"
					+ ".project{font-size:18px!important}}")
			.doesNotContain(".code{");
	}

	@ParameterizedTest
	@ValueSource(strings = { "title", "preview", "heading", "logoUrl", "card", "footer" })
	void missingFrameArgumentsAreNamed(String missing) {
		assertThatNullPointerException()
			.isThrownBy(() -> MailFrame.html(missing.equals("title") ? null : "Title",
					missing.equals("preview") ? null : "Preview", missing.equals("heading") ? null : "Heading",
					missing.equals("logoUrl") ? null : Optional.empty(), missing.equals("card") ? null : "<p>Card</p>",
					missing.equals("footer") ? null : "Footer"))
			.withMessage(missing);
	}

	@Test
	void missingMobileStylesAreNamed() {
		assertThatNullPointerException()
			.isThrownBy(() -> MailFrame.html("Title", "Preview", "Heading", Optional.empty(), "<p>Card</p>",
					"Footer", null))
			.withMessage("mobileStyles");
	}

	@Test
	void missingTextToEscapeIsNamed() {
		assertThatNullPointerException().isThrownBy(() -> MailFrame.escape(null)).withMessage("value");
	}

}
