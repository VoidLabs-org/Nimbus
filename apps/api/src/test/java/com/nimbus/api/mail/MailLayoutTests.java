package com.nimbus.api.mail;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MailLayoutTests {

	@ParameterizedTest
	@ValueSource(strings = { "fallback", "logo" })
	void frameMatchesTheSavedLayout(String variant) throws IOException {
		var html = MailFrame.html("A & <title>", "Preview & <text>", "Heading & <text>", logo(variant),
				"<p>Custom &amp; safe card</p>", "Footer & <text>");

		assertThat(html).isEqualTo(fixture("frame-" + variant + ".html.snap"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "fallback", "logo" })
	void noticeMatchesTheSavedLayout(String variant) throws IOException {
		var html = NoticeMail.html("A & <title>", "Heading & <text>", "Line & <text>", Optional.of("Not you? & <help>"),
				"Review & <open>", "https://example.dev/security?a=1&b=2", "Footer & <text>", logo(variant));

		assertThat(html).isEqualTo(fixture("notice-" + variant + ".html.snap"));
	}

	private static Optional<String> logo(String variant) {
		return variant.equals("logo") ? Optional.of("https://assets.example.dev/icon.png?a=1&b=2") : Optional.empty();
	}

	private static String fixture(String file) throws IOException {
		try (var stream = MailLayoutTests.class.getResourceAsStream("/mail/" + file)) {
			assertThat(stream).as("saved layout %s", file).isNotNull();
			return new String(stream.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n");
		}
	}

}
