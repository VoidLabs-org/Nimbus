package com.nimbus.api.identity.internal;

import java.time.Duration;

import com.nimbus.api.mail.Mail;

/** The email that carries a Verification code. identity owns the wording; {@code mail} only delivers it. */
final class VerificationMail {

	private VerificationMail() {
	}

	static Mail to(String email, String code, Duration lifetime) {
		var line = "Enter this in Nimbus to verify your email. It expires in " + lifetime.toMinutes() + " minutes.";
		var ignore = "If you didn't sign up for Nimbus, you can ignore this email.";
		var text = "Your Nimbus verification code is " + code + "\n\n" + line + "\n\n" + ignore;
		var html = """
				<!doctype html>
				<html><body style="font-family: sans-serif; color: #1f2430;">
				<p>Your Nimbus verification code is</p>
				<p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 16px 0;">%s</p>
				<p>%s</p>
				<p style="color: #6b7280;">%s</p>
				</body></html>
				""".formatted(code, line, ignore);
		// Not in the subject: subjects show in lock-screen previews and in mail providers' logs.
		return new Mail(email, "Your Nimbus verification code", html, text);
	}

}
