package com.nimbus.api.identity.internal;

import java.time.Duration;
import java.util.Optional;

import com.nimbus.api.mail.Mail;

/** The email that carries a Reset code (design 05). identity owns the wording; {@code mail} supplies the frame and delivery. */
final class ResetMail {

	private static final String SUBJECT = "Your Nimbus password reset code";

	private ResetMail() {
	}

	/** @param logoUrl see {@link CodeMail#html} */
	static Mail to(String email, String code, Duration lifetime, Optional<String> logoUrl) {
		var line = "Enter this in Nimbus to reset your password. It expires in " + lifetime.toMinutes() + " minutes.";
		var ignore = "If you didn't ask for this, ignore this email. Your password won't change.";
		var text = "Your Nimbus password reset code is " + code + "\n\n" + line + "\n\n"
				+ "Nimbus will never ask for this code by phone, chat or email.\n\n" + ignore;
		// Not in the subject, the title or the preview line: those show in inbox lists, on lock screens and in
		// mail providers' logs.
		return new Mail(email, SUBJECT,
				CodeMail.html(SUBJECT, "Reset your password", line, "Your reset code is", code, ignore, lifetime,
						logoUrl),
				text);
	}

}
