package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import com.nimbus.api.mail.Mail;

/** The emails that tell a User a provider was disconnected from, or connected to, their account. identity owns the wording. */
final class ProviderMail {

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'")
		.withZone(ZoneOffset.UTC);

	private ProviderMail() {
	}

	/**
	 * @param provider the provider's name as people write it, e.g. {@code Google}
	 * @param securityUrl the address of the Security page
	 */
	static Mail disconnected(String email, String provider, Instant at, String securityUrl) {
		return build(email, provider + " was disconnected from your Nimbus account",
				"On " + WHEN.format(at) + ", " + provider + " was disconnected from your Nimbus account, so it can "
						+ "no longer be used to sign in.",
				"Not you, or want it back?", securityUrl);
	}

	/** @see #disconnected */
	static Mail connected(String email, String provider, Instant at, String securityUrl) {
		return build(email, provider + " was connected to your Nimbus account",
				"On " + WHEN.format(at) + ", " + provider + " was connected to your Nimbus account, so it can now be "
						+ "used to sign in.",
				"Not you?", securityUrl);
	}

	private static Mail build(String email, String subject, String line, String question, String securityUrl) {
		var next = question + " Review your sign-in methods on the Security page: " + securityUrl;
		var style = "font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px";
		var html = "<p style=\"" + style + "\">" + escape(line) + "</p><p style=\"" + style + "\">" + escape(question)
				+ " Review your sign-in methods on the <a href=\"" + escape(securityUrl) + "\">Security page</a>.</p>";
		return new Mail(email, subject, html, line + "\n\n" + next);
	}

	private static String escape(String value) {
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

}
