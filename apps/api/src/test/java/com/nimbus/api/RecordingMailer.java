package com.nimbus.api;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Pattern;

import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * Stands in for {@code mail} in tests (the mailer, and a made-up image host): keeps every email "sent", so a test reads a Verification code out of the
 * email the way a person reads their inbox. It is a bean of every test application context. The emails are
 * kept for the whole test run, whichever context sent them, so tests use an address of their own.
 */
@Component
@Primary
public class RecordingMailer implements Mailer, MailAssets {

	public static final String IMAGE_HOST = "https://assets.test";

	private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

	private static final List<Mail> SENT = new CopyOnWriteArrayList<>();

	private static final List<Mail> ATTEMPTED = new CopyOnWriteArrayList<>();

	private static volatile boolean failing;

	@Override
	public void send(Mail mail) {
		ATTEMPTED.add(mail);
		if (failing) {
			throw new IllegalStateException("The mail service is down");
		}
		SENT.add(mail);
	}

	/** A made-up host, so test emails carry their images the way production emails do. */
	@Override
	public Optional<String> url(String file) {
		return Optional.of(IMAGE_HOST + "/" + file);
	}

	/** Makes every send throw, as a broken mail service could. Call {@code failing(false)} when done. */
	public static void failing(boolean failing) {
		RecordingMailer.failing = failing;
	}

	public static List<Mail> sentTo(String email) {
		return SENT.stream().filter(mail -> mail.to().equals(email)).toList();
	}

	/** Every email Nimbus tried to send to {@code email}, including those that failed while {@link #failing} was on. */
	public static List<Mail> attemptedTo(String email) {
		return ATTEMPTED.stream().filter(mail -> mail.to().equals(email)).toList();
	}

	/** The 6-digit code in the newest email sent to {@code email}. */
	public static String lastCodeFor(String email) {
		var mails = sentTo(email);
		if (mails.isEmpty()) {
			throw new AssertionError("No email was sent to " + email);
		}
		var matcher = CODE.matcher(mails.get(mails.size() - 1).text());
		if (!matcher.find()) {
			throw new AssertionError("The email to " + email + " holds no 6-digit code");
		}
		return matcher.group(1);
	}

}
