package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import com.nimbus.api.mail.Mail;

/** The email that tells a User a provider was disconnected from their account. identity owns the wording. */
final class DisconnectMail {

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'")
		.withZone(ZoneOffset.UTC);

	private DisconnectMail() {
	}

	/**
	 * @param provider the provider's name as people write it, e.g. {@code Google}
	 * @param securityUrl the address of the Security page
	 */
	static Mail to(String email, String provider, Instant at, String securityUrl) {
		var subject = provider + " was disconnected from your Nimbus account";
		var line = "On " + WHEN.format(at) + ", " + provider + " was disconnected from your Nimbus account, so it can "
				+ "no longer be used to sign in.";
		var next = "Not you, or want it back? Review your sign-in methods on the Security page: " + securityUrl;
		var text = line + "\n\n" + next;
		var html = "<p style=\"font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:24px\">"
				+ escape(line) + "</p><p style=\"font-family:Helvetica,Arial,sans-serif;font-size:16px;"
				+ "line-height:24px\">Not you, or want it back? Review your sign-in methods on the "
				+ "<a href=\"" + escape(securityUrl) + "\">Security page</a>.</p>";
		return new Mail(email, subject, html, text);
	}

	private static String escape(String value) {
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
	}

}
