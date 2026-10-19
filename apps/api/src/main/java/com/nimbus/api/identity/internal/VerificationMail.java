package com.nimbus.api.identity.internal;

import java.time.Duration;
import java.util.Optional;

import com.nimbus.api.mail.Mail;

/** The email that carries a Verification code. identity owns the wording; {@code mail} supplies the frame and delivery. */
final class VerificationMail {

	private static final String SUBJECT = "Your Nimbus verification code";

	private VerificationMail() {
	}

	/** @param logoUrl see {@link CodeMail#html} */
	static Mail to(String email, String code, Duration lifetime, Optional<String> logoUrl) {
		var line = "Enter this in Nimbus to verify your email. It expires in " + lifetime.toMinutes() + " minutes.";
		var ignore = "If you didn't sign up for Nimbus, you can ignore this email.";
		var text = "Your Nimbus verification code is " + code + "\n\n" + line + "\n\n"
				+ "Nimbus will never ask for this code by phone, chat or email.\n\n" + ignore;
		// Not in the subject, the title or the preview line: those show in inbox lists, on lock screens and in
		// mail providers' logs.
		return new Mail(email, SUBJECT,
				CodeMail.html(SUBJECT, "Verify your email", line, "Your verification code is", code, ignore, lifetime,
						logoUrl),
				text);
	}

}
