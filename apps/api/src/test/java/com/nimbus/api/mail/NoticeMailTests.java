package com.nimbus.api.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class NoticeMailTests {

	@ParameterizedTest
	@ValueSource(strings = { "title", "preview", "heading", "line", "tile", "button", "url", "footer", "logoUrl" })
	void missingNoticeArgumentsAreNamed(String missing) {
		assertThatNullPointerException()
			.isThrownBy(() -> NoticeMail.html(missing.equals("title") ? null : "Title",
					missing.equals("preview") ? null : "Preview", missing.equals("heading") ? null : "Heading",
					missing.equals("line") ? null : "Line", missing.equals("tile") ? null : Optional.empty(),
					missing.equals("button") ? null : "Open", missing.equals("url") ? null : "https://example.dev",
					missing.equals("footer") ? null : "Footer", missing.equals("logoUrl") ? null : Optional.empty()))
			.withMessage(missing);
	}

	@Test
	void aNotificationCanOmitTheSecurityTileAndChooseItsInboxPreview() {
		var html = NoticeMail.html("Assigned", "New work for you", "Issue assigned", "Ada assigned NIM-12 to you.",
				Optional.empty(), "Open Issue", "https://example.dev/issues/NIM-12", "Your project updates",
				Optional.empty());

		assertThat(html).contains("New work for you&#8199;")
			.contains("Ada assigned NIM-12 to you.")
			.contains(">Open Issue</a>")
			.doesNotContain("class=\"tile muted\"");
	}

	@ParameterizedTest
	@ValueSource(strings = { "javascript:alert(1)", "data:text/html,hello", "/settings/security",
			"//example.dev/security", "https:///missing-host", "https://", "not a URL" })
	void rejectsButtonUrlsWithoutAnAbsoluteHttpOrHttpsDestination(String url) {
		assertThatIllegalArgumentException().isThrownBy(() -> notice(url)).withMessageContaining("url");
	}

	@ParameterizedTest
	@ValueSource(strings = { "https://example.dev/security?a=1&b=2", "http://localhost:3000/settings/security" })
	void acceptsWebDestinationsIncludingLocalDevelopment(String url) {
		assertThat(notice(url)).contains("href=\"" + url.replace("&", "&amp;") + "\"");
	}

	@ParameterizedTest
	@ValueSource(strings = { "title", "heading", "line", "details", "tile", "footer", "logoUrl" })
	void missingArgumentsOfANoticeWithoutAButtonAreNamed(String missing) {
		assertThatNullPointerException()
			.isThrownBy(() -> NoticeMail.html(missing.equals("title") ? null : "Title",
					missing.equals("heading") ? null : "Heading", missing.equals("line") ? null : "Line",
					missing.equals("details") ? null : List.of(new NoticeMail.Detail("When", "Now")),
					missing.equals("tile") ? null : Optional.empty(), missing.equals("footer") ? null : "Footer",
					missing.equals("logoUrl") ? null : Optional.empty()))
			.withMessage(missing);
	}

	@Test
	void aNoticeWithoutAButtonListsItsDetailsEscapedAndInOrder() {
		var html = NoticeMail.html("Changed", "Email changed", "Your email changed.",
				List.of(new NoticeMail.Detail("New <email>", "a&b@example.dev"), new NoticeMail.Detail("When", "Today")),
				Optional.of("Not you?"), "Footer", Optional.empty());

		assertThat(html).contains("Your email changed.&#8199;")
			.containsSubsequence(">New &lt;email&gt;</td>", ">a&amp;b@example.dev</td>", ">When</td>", ">Today</td>",
					">Not you?</td>")
			.doesNotContain("<a ");
	}

	@Test
	void aNoticeWithoutAButtonNeedsADetail() {
		assertThatIllegalArgumentException()
			.isThrownBy(() -> NoticeMail.html("Title", "Heading", "Line", List.of(), Optional.empty(), "Footer",
					Optional.empty()))
			.withMessageContaining("details");
	}

	private static String notice(String url) {
		return NoticeMail.html("Title", "Heading", "Line", Optional.of("Not you?"), "Review", url, "Footer", Optional.empty());
	}

}
