package com.nimbus.api.notifications.internal;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import com.nimbus.api.identity.Users;
import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import com.nimbus.api.mail.NoticeMail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * What every Security alert has in common: a Notification in the panel and, right after it commits, an email, for a
 * User who has verified their email. Security alerts are always sent, whoever caused the change.
 */
@Component
class SecurityAlerts {

	private static final Logger log = LoggerFactory.getLogger(SecurityAlerts.class);

	static final String FOOTER = "Security alerts are always sent and can't be turned off.";

	private final NotificationInbox inbox;
	private final Users users;
	private final Mailer mailer;
	private final MailAssets assets;
	private final String publicUrl;

	SecurityAlerts(NotificationInbox inbox, Users users, Mailer mailer, MailAssets assets,
			@Value("${nimbus.auth.public-url}") String publicUrl) {
		this.inbox = inbox;
		this.users = users;
		this.mailer = mailer;
		this.assets = assets;
		this.publicUrl = publicUrl.replaceAll("/+$", "");
	}

	/** The Security page, where every Security alert points. */
	String securityUrl() {
		return publicUrl + NotificationInbox.SECURITY_LINK;
	}

	Optional<String> logo() {
		return assets.url(MailAssets.NIMBUS_ICON_DARK);
	}

	/**
	 * The text of an alert whose email is a line, what to do if it wasn't them, and a button to the Security page.
	 *
	 * @param subject the email's subject
	 * @param title the heading of the email
	 * @param line what happened
	 * @param help what to do if it wasn't them
	 */
	record Standard(String subject, String title, String line, String help) {
	}

	/**
	 * Stores the Notification and arranges the email for after the commit; does nothing when the User is unknown or
	 * unverified, or when this alert was already stored (a redelivered event).
	 *
	 * @param mail builds the email for the User's address
	 */
	void deliver(UUID userId, String type, String dedupeKey, Instant at, Map<String, String> snapshot,
			Function<String, Mail> mail) {
		var recipient = users.findAllById(List.of(userId)).stream().findFirst();
		// An unverified address may belong to someone else, and they can't open the inbox anyway.
		if (recipient.isEmpty() || !recipient.get().emailVerified()) return;
		if (!inbox.add(userId, type, dedupeKey, snapshot, at)) return;
		var message = mail.apply(recipient.get().email());
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				try {
					mailer.send(message);
				}
				catch (RuntimeException e) {
					log.warn("Could not send the {} Security alert {}", type, dedupeKey, e);
				}
			}
		});
	}

	Mail standard(String email, Standard alert) {
		var url = securityUrl();
		return new Mail(email, alert.subject(),
			NoticeMail.html(alert.subject(), alert.title(), alert.line(), Optional.of(alert.help()), "Review security",
				url, FOOTER, logo()),
			alert.line() + "\n\n" + alert.help() + "\nReview security: " + url + "\n\n" + FOOTER);
	}
}
