package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.MailFrame;
import com.nimbus.api.mail.NoticeMail;

/** The emails that tell a User a provider was disconnected from, or connected to, their account. identity owns the wording. */
final class ProviderMail {

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'")
		.withZone(ZoneOffset.UTC);

	private static final String FOOTER = "You get this email whenever a way to sign in is added to or removed from your Nimbus account.";

	private static final String BUTTON = "Review sign-in methods";

	private ProviderMail() {
	}

	/**
	 * @param provider the provider's name as people write it, e.g. {@code Google}
	 * @param securityUrl the address of the Security page
	 * @param logoUrl see {@link MailFrame#html}
	 */
	static Mail disconnected(String email, String provider, Instant at, String securityUrl,
			Optional<String> logoUrl) {
		return build(email, provider + " was disconnected from your Nimbus account", provider + " disconnected",
				"On " + WHEN.format(at) + ", " + provider + " was disconnected from your Nimbus account, so it can "
						+ "no longer be used to sign in.",
				"Not you, or want it back? Review your sign-in methods on the Security page.", securityUrl, logoUrl);
	}

	/** @see #disconnected */
	static Mail connected(String email, String provider, Instant at, String securityUrl, Optional<String> logoUrl) {
		return build(email, provider + " was connected to your Nimbus account", provider + " connected",
				"On " + WHEN.format(at) + ", " + provider + " was connected to your Nimbus account, so it can now be "
						+ "used to sign in.",
				"Not you? Review your sign-in methods on the Security page.", securityUrl, logoUrl);
	}

	private static Mail build(String email, String subject, String heading, String line, String ifNotYou,
			String securityUrl, Optional<String> logoUrl) {
		var text = line + "\n\n" + ifNotYou + "\n" + securityUrl + "\n\n" + FOOTER;
		return new Mail(email, subject,
				NoticeMail.html(subject, heading, line, ifNotYou, BUTTON, securityUrl, FOOTER, logoUrl), text);
	}

}
