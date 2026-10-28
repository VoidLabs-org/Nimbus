package com.nimbus.api.notifications.internal;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

import com.nimbus.api.identity.SignedIn;
import com.nimbus.api.identity.Users;
import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import com.nimbus.api.mail.NoticeMail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
class SignInNotifications {

	private static final Logger log = LoggerFactory.getLogger(SignInNotifications.class);
	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm 'UTC'", java.util.Locale.ENGLISH).withZone(ZoneOffset.UTC);
	private static final String TITLE = "New sign-in to your account";
	private static final String FOOTER = "Security alerts are always sent and can't be turned off.";
	private final NotificationInbox inbox;
	private final Users users;
	private final Mailer mailer;
	private final MailAssets assets;
	private final String publicUrl;

	SignInNotifications(NotificationInbox inbox, Users users, Mailer mailer, MailAssets assets,
			@Value("${nimbus.auth.public-url}") String publicUrl) {
		this.inbox = inbox;
		this.users = users;
		this.mailer = mailer;
		this.assets = assets;
		this.publicUrl = publicUrl.replaceAll("/+$", "");
	}

	@ApplicationModuleListener
	void on(SignedIn event) {
		var recipient = users.findAllById(List.of(event.userId())).stream().findFirst();
		// An unverified address may belong to someone else, and they can't open the inbox anyway.
		if (recipient.isEmpty() || !recipient.get().emailVerified()) return;
		if (!inbox.signedIn(event.userId(), event.sessionId(), TITLE, event.deviceLabel(), event.at())) return;
		var line = "Your Nimbus account was signed in on " + event.deviceLabel() + " on " + WHEN.format(event.at()) + ".";
		var help = "If this wasn't you, review your sessions and change your password.";
		var security = publicUrl + NotificationInbox.SECURITY_LINK;
		var footer = FOOTER;
		var mail = new Mail(recipient.get().email(), TITLE,
			NoticeMail.html(TITLE, TITLE, line, Optional.of(help), "Review security", security, footer, assets.url(MailAssets.NIMBUS_ICON_DARK)),
			line + "\n\n" + help + "\nReview security: " + security + "\n\n" + footer);
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				try {
					mailer.send(mail);
				}
				catch (RuntimeException e) {
					log.warn("Could not send sign-in Security alert for Session {}", event.sessionId(), e);
				}
			}
		});
	}
}
