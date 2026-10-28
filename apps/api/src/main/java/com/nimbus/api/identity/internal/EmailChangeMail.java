package com.nimbus.api.identity.internal;

import java.time.Duration;
import java.util.Optional;

import com.nimbus.api.mail.Mail;

/** The email that carries the Verification code for a new address. Laid out like {@link VerificationMail}. */
final class EmailChangeMail {

	private static final String SUBJECT = "Confirm your new Nimbus email";

	private EmailChangeMail() {
	}

	/** @param logoUrl see {@link CodeMail#html} */
	static Mail to(String newEmail, String code, Duration lifetime, Optional<String> logoUrl) {
		var line = "Enter this in Nimbus to change your email to this address. It expires in " + lifetime.toMinutes()
				+ " minutes.";
		var ignore = "If you didn't ask to change your Nimbus email, you can ignore this email.";
		var text = "Your Nimbus code is " + code + "\n\n" + line + "\n\n"
				+ "Nimbus will never ask for this code by phone, chat or email.\n\n" + ignore;
		// Not in the subject, the title or the preview line, as for the other codes.
		return new Mail(newEmail, SUBJECT,
				CodeMail.html(SUBJECT, "Confirm your new email", line, "Your code is", code, ignore, lifetime, logoUrl),
				text);
	}

}
