package com.nimbus.api.notifications.internal;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import com.nimbus.api.issues.IssueCreated;
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


/**
 * Turns the events of {@code issues} into Notifications for the Reporter and Assignee, never for the User who acted.
 * The panel line is a snapshot of the actor's name, the Issue key and its title, so later renames do not change it.
 */
@Component
class IssueNotifications {

	private static final Logger log = LoggerFactory.getLogger(IssueNotifications.class);

	static final String FOOTER = "You get this because you reported or are assigned to this issue.";

	private final NotificationInbox inbox;
	private final NotificationSettings settings;
	private final Users users;
	private final Mailer mailer;
	private final MailAssets assets;
	private final Clock clock;
	private final String publicUrl;

	IssueNotifications(NotificationInbox inbox, NotificationSettings settings, Users users, Mailer mailer,
			MailAssets assets, Clock clock, @Value("${nimbus.auth.public-url}") String publicUrl) {
		this.inbox = inbox;
		this.settings = settings;
		this.users = users;
		this.mailer = mailer;
		this.assets = assets;
		this.clock = clock;
		this.publicUrl = publicUrl.replaceAll("/+$", "");
	}

	/** Only the Assignee hears about being assigned, and not when they assigned themselves. */
	@ApplicationModuleListener
	void on(IssueCreated event) {
		if (event.assigneeId() == null || event.assigneeId().equals(event.actorId())) return;
		var actor = users.findAllById(List.of(event.actorId())).stream().findFirst();
		deliver(event.assigneeId(), NotificationSettings.IssueType.ISSUE_ASSIGNED,
			"ISSUE_ASSIGNED:" + event.projectId() + ":" + event.issueKey() + ":created", event.projectId(),
			event.issueKey(), event.actorId(), event.title(), actor.map(UserSummary::displayName).orElse("Someone"),
			actor.map(UserSummary::avatarUrl).orElse(null));
	}

	private void deliver(UUID recipientId, NotificationSettings.IssueType type, String dedupeKey, UUID projectId,
			String issueKey, UUID actorId, String title, String actorName, String actorAvatarUrl) {
		var recipient = users.findAllById(List.of(recipientId)).stream().findFirst();
		// An unverified address may belong to someone else, and they can't open the inbox anyway.
		if (recipient.isEmpty() || !recipient.get().emailVerified()) return;
		var snapshot = new LinkedHashMap<String, String>();
		snapshot.put("actorName", actorName);
		if (actorAvatarUrl != null) snapshot.put("actorAvatarUrl", actorAvatarUrl);
		snapshot.put("issueKey", issueKey);
		snapshot.put("title", title);
		// The event carries no time, so the Notification is dated when it is handled.
		if (!inbox.add(recipientId, type.name(), dedupeKey, snapshot, clock.instant(), projectId, issueKey, actorId)) return;
		if (!settings.emailOn(recipientId, type)) return;
		var message = assigned(recipient.get().email(), actorName, issueKey, title);
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				try {
					mailer.send(message);
				}
				catch (RuntimeException e) {
					log.warn("Could not send the {} email {}", type, dedupeKey, e);
				}
			}
		});
	}

	private Mail assigned(String to, String actorName, String issueKey, String title) {
		var subject = actorName + " assigned you " + issueKey;
		var line = actorName + " assigned you " + issueKey + " · " + title + ".";
		var button = "Open " + issueKey;
		var url = publicUrl + "/issues/" + issueKey;
		return new Mail(to, subject,
			NoticeMail.html(subject, "Assigned to you", line, Optional.empty(), button, url, FOOTER,
				assets.url(MailAssets.NIMBUS_ICON_DARK)),
			line + "\n\n" + button + ": " + url + "\n\n" + FOOTER);
	}
}
