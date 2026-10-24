package com.nimbus.api.mail;

import static com.nimbus.api.mail.MailFrame.MUTED_STYLE;
import static com.nimbus.api.mail.MailFrame.escape;

import java.net.URI;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;

/**
 * Emails that tell the recipient something happened: the shared {@link MailFrame} with a line of text, an optional
 * tile, and either a button that points at a page or, for a notice with nothing to do, a list of details.
 */
public final class NoticeMail {

	// English whatever the JVM's locale, like the rest of the wording. UTC, since Nimbus stores no time zone per User.
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'", Locale.ENGLISH)
		.withZone(ZoneOffset.UTC);

	private static final String TILE = """
			<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="margin:%s"><tr><td class="tile muted" bgcolor="#f4f2ef" style="padding:14px 20px;border-radius:16px;background:#f4f2ef;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#6b6763">%s</td></tr></table>
			""";

	private static final String DETAIL = """
			<tr><td class="muted rule" style="padding:12px 16px 12px 0;border-bottom:1px solid #e8e4df;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#6b6763">%s</td><td class="ink rule" align="right" style="padding:12px 0;border-bottom:1px solid #e8e4df;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;font-weight:bold;color:#201d1a">%s</td></tr>
			""";

	/**
	 * One labelled fact in a notice without a button, such as when something happened.
	 *
	 * @param label what the value is, e.g. {@code When}
	 * @param value the plain-text value
	 */
	public record Detail(String label, String value) {

		public Detail {
			Objects.requireNonNull(label, "label");
			Objects.requireNonNull(value, "value");
		}

	}

	private NoticeMail() {
	}

	/** When something happened, as every notice shows it: {@code 24 Oct 2026, 09:05 UTC}. */
	public static String time(Instant at) {
		return TIME.format(at);
	}

	/**
	 * @param title the subject; it is also the HTML title
	 * @param heading the large heading in the dark band
	 * @param line what happened; also used as the hidden preview line
	 * @param tile optional supporting text, such as what to do if this was not the recipient
	 * @param button the label of the button, which opens {@code url}
	 * @param url an absolute HTTP(S) destination with a host; callers must trust the destination
	 * @param footer the small print under the card
	 * @param logoUrl see {@link MailFrame#html}
	 */
	public static String html(String title, String heading, String line, Optional<String> tile, String button, String url,
			String footer, Optional<String> logoUrl) {
		Objects.requireNonNull(line, "line");
		return html(title, line, heading, line, tile, button, url, footer, logoUrl);
	}

	/**
	 * Renders a notice with a separate inbox preview. All content is plain text and escaped.
	 * The tile is omitted when empty; the URL must be absolute HTTP(S) with a host.
	 * @param preview the hidden inbox preview; must not contain secrets
	 * @see #html(String, String, String, Optional, String, String, String, Optional)
	 */
	public static String html(String title, String preview, String heading, String line, Optional<String> tile,
			String button, String url, String footer, Optional<String> logoUrl) {
		Objects.requireNonNull(title, "title");
		Objects.requireNonNull(preview, "preview");
		Objects.requireNonNull(heading, "heading");
		Objects.requireNonNull(line, "line");
		Objects.requireNonNull(tile, "tile");
		Objects.requireNonNull(button, "button");
		Objects.requireNonNull(url, "url");
		Objects.requireNonNull(footer, "footer");
		Objects.requireNonNull(logoUrl, "logoUrl");
		validateUrl(url);
		var tileHtml = tile.map(value -> TILE.formatted("0 0 24px 0", escape(value))).orElse("");
		var card = """
				<p class="muted" style="margin:0 0 20px 0;%1$s">%2$s</p>
				%3$s<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ff6b3d" style="border-radius:999px;background:#ff6b3d"><a href="%4$s" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#201d1a;text-decoration:none">%5$s</a></td></tr></table>"""
			.formatted(MUTED_STYLE, escape(line), tileHtml, escape(url), escape(button));
		return MailFrame.html(title, preview, heading, logoUrl, card, footer);
	}

	/**
	 * Renders a notice with nothing for the recipient to open: the line, then the details, then the tile, and no
	 * button. All content is plain text and escaped; the line is also the inbox preview.
	 * @param details the labelled facts, in order; at least one
	 * @see #html(String, String, String, Optional, String, String, String, Optional)
	 */
	public static String html(String title, String heading, String line, List<Detail> details, Optional<String> tile,
			String footer, Optional<String> logoUrl) {
		Objects.requireNonNull(title, "title");
		Objects.requireNonNull(heading, "heading");
		Objects.requireNonNull(line, "line");
		Objects.requireNonNull(details, "details");
		Objects.requireNonNull(tile, "tile");
		Objects.requireNonNull(footer, "footer");
		Objects.requireNonNull(logoUrl, "logoUrl");
		if (details.isEmpty()) {
			throw new IllegalArgumentException("details must not be empty");
		}
		var rows = new StringBuilder();
		details.forEach(detail -> rows.append(DETAIL.formatted(escape(detail.label()), escape(detail.value()))));
		var detailsMargin = tile.isPresent() ? "0 0 24px 0" : "0";
		// The tile is last in the card, so it needs no space under it.
		var tileHtml = tile.map(value -> TILE.formatted("0", escape(value))).orElse("");
		var card = """
				<p class="muted" style="margin:0 0 20px 0;%1$s">%2$s</p>
				<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" class="rule" style="margin:%3$s;border-top:1px solid #e8e4df">
				%4$s</table>
				%5$s"""
			.formatted(MUTED_STYLE, escape(line), detailsMargin, rows, tileHtml);
		return MailFrame.html(title, line, heading, logoUrl, card, footer);
	}

	private static void validateUrl(String url) {
		try {
			var uri = URI.create(url);
			if (uri.getHost() != null
					&& ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))) {
				return;
			}
		}
		catch (IllegalArgumentException ignored) {
			// Give malformed URLs the same diagnostic as unsupported schemes and missing hosts.
		}
		throw new IllegalArgumentException("url must be an absolute HTTP(S) URL with a host");
	}

}
