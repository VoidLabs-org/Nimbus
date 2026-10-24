package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.MailFrame;
import com.nimbus.api.mail.NoticeMail;

/**
 * The notice to a User's previous address that their email changed (39l). It hides most of the new address and
 * offers no undo: whoever reads the old inbox may not be the User any more.
 */
final class EmailChangedMail {

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'")
		.withZone(ZoneOffset.UTC);

	private static final String SUBJECT = "Your Nimbus email was changed";

	private static final String IF_NOT_YOU = "If you made this change, there's nothing to do. If you didn't, contact "
			+ "your Nimbus admin straight away.";

	private static final String FOOTER = "This notice is sent to your previous address and can't be turned off.";

	/** Three bullets, built from the code point so the source stays ASCII. */
	private static final String DOTS = String.valueOf((char) 0x2022).repeat(3);

	private EmailChangedMail() {
	}

	/**
	 * @param oldEmail where the notice goes
	 * @param newEmail the User's email now; only its first character and domain are shown
	 * @param logoUrl see {@link MailFrame#html}
	 */
	static Mail to(String oldEmail, String newEmail, Instant at, Optional<String> logoUrl) {
		var masked = mask(newEmail);
		var line = "The email on your account is now " + masked + ". This address won't get Nimbus emails any more.";
		var when = WHEN.format(at);
		var text = line + "\n\nNew email: " + masked + "\nWhen: " + when + "\n\n" + IF_NOT_YOU + "\n\n" + FOOTER;
		return new Mail(oldEmail, SUBJECT, NoticeMail.html(SUBJECT, SUBJECT, line,
				List.of(new NoticeMail.Detail("New email", masked), new NoticeMail.Detail("When", when)),
				Optional.of(IF_NOT_YOU), FOOTER, logoUrl), text);
	}

	/** The first character, three bullets, then {@code @} and the whole domain, as the design shows. */
	static String mask(String email) {
		var at = email.lastIndexOf('@');
		return email.substring(0, 1) + DOTS + email.substring(at);
	}

}
