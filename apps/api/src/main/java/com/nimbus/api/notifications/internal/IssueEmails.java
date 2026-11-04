package com.nimbus.api.notifications.internal;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.identity.Users;
import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import com.nimbus.api.mail.NoticeMail;
import com.nimbus.api.projects.Projects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Sends the emails of Issue Notifications that were gathered: one email per User and Issue, listing every change since
 * the last email. A group is due 3 minutes after its last change, and 10 minutes after its first at the latest (see
 * {@link NotificationInbox#scheduleEmail}). Whether the Notification was read in the app makes no difference.
 */
@Component
class IssueEmails {

	private static final Logger log = LoggerFactory.getLogger(IssueEmails.class);

	private final NotificationInbox inbox;
	private final NotificationSettings settings;
	private final Users users;
	private final Projects projects;
	private final Mailer mailer;
	private final MailAssets assets;
	private final Clock clock;
	private final String publicUrl;

	IssueEmails(NotificationInbox inbox, NotificationSettings settings, Users users, Projects projects, Mailer mailer,
			MailAssets assets, Clock clock, @Value("${nimbus.auth.public-url}") String publicUrl) {
		this.inbox = inbox;
		this.settings = settings;
		this.users = users;
		this.projects = projects;
		this.mailer = mailer;
		this.assets = assets;
		this.clock = clock;
		this.publicUrl = publicUrl.replaceAll("/+$", "");
	}

	/**
	 * Claims the due groups before sending, so an email is never sent twice, also when two instances run this. As
	 * with every other send, a failure is logged and not retried. Someone who left the project or whose address is
	 * no longer verified in the meantime is not mailed, since the email holds the Issue's title.
	 */
	@Scheduled(cron = "${nimbus.notifications.email-cron:0 * * * * *}", zone = "UTC")
	void run() {
		// One group at a time: a crash while sending loses the email being sent, not every email that was due.
		for (var changes = inbox.claimDueEmail(clock.instant()); !changes.isEmpty();
				changes = inbox.claimDueEmail(clock.instant())) {
			var first = changes.getFirst();
			try {
				send(first.userId(), first.projectId(), first.issueKey(), changes);
			}
			catch (RuntimeException e) {
				log.warn("Could not send the email about {} to {}", first.issueKey(), first.userId(), e);
			}
		}
	}

	private void send(UUID userId, UUID projectId, String issueKey, List<NotificationInbox.Change> claimed) {
		// A User may have switched a type off while the group waited.
		var changes = claimed.stream().filter(c -> settings.wantsEmail(userId,
			NotificationSettings.IssueType.valueOf(c.type()), c.snapshot().has("edits"))).toList();
		if (changes.isEmpty()) return;
		users.findAllById(List.of(userId)).stream().findFirst()
			.filter(user -> user.emailVerified() && projects.isMember(projectId, user.id()))
			.ifPresent(user -> mailer.send(mail(user.email(), issueKey, changes)));
	}

	private Mail mail(String to, String issueKey, List<NotificationInbox.Change> changes) {
		var deleted = changes.stream().filter(c -> c.type().equals("ISSUE_DELETED")).findFirst();
		// The title the Issue had when it was deleted, else the one of the latest change.
		var last = changes.getLast();
		var title = deleted.orElse(last).snapshot().path("title").asString("");
		var button = deleted.map(d -> "Open project " + d.snapshot().path("projectName").asString(""))
			.orElse("Open " + issueKey);
		var url = publicUrl + deleted.map(d -> "/projects/" + d.snapshot().path("projectKey").asString(""))
			.orElse("/issues/" + issueKey);
		var logo = assets.url(MailAssets.NIMBUS_ICON_DARK);
		var single = changes.size() == 1;
		var heading = single ? heading(last.type()) : changes.size() + " updates";
		var subject = single ? subject(last, issueKey) : heading + " on " + issueKey;
		var line = single ? subject + " · " + title + extra(last.snapshot()) + "." : issueKey + " · " + title + ".";
		var details = single ? List.<NoticeMail.Detail>of()
			: changes.stream().map(c -> new NoticeMail.Detail(what(c), NoticeMail.time(c.at()))).toList();
		var text = new StringBuilder(line).append("\n\n");
		details.forEach(d -> text.append("- ").append(d.label()).append(" (").append(d.value()).append(")\n"));
		if (!details.isEmpty()) text.append("\n");
		text.append(button).append(": ").append(url).append("\n\n").append(IssueNotifications.FOOTER);
		var html = single
			? NoticeMail.html(subject, heading, line, Optional.empty(), button, url, IssueNotifications.FOOTER, logo)
			: NoticeMail.html(subject, heading, line, details, button, url, IssueNotifications.FOOTER, logo);
		return new Mail(to, subject, html, text.toString());
	}

	private static String heading(String type) {
		return switch (type) {
			case "ISSUE_UNASSIGNED" -> "Unassigned from you";
			case "ISSUE_STATUS_CHANGED" -> "Status changed";
			case "ISSUE_DELETED" -> "Issue deleted";
			default -> "Issue edited";
		};
	}

	/** What happened, as the subject of a single change says it. */
	private static String subject(NotificationInbox.Change change, String issueKey) {
		var s = change.snapshot();
		var actor = s.path("actorName").asString("Someone");
		return switch (change.type()) {
			case "ISSUE_UNASSIGNED" -> actor + " unassigned you from " + issueKey;
			case "ISSUE_STATUS_CHANGED" -> actor + " moved " + issueKey + " " + move(s);
			case "ISSUE_DELETED" -> actor + " deleted " + issueKey;
			default -> actor + " " + s.path("summary").asString("edited") + " on " + issueKey;
		};
	}

	/** What happened, without the Issue, as a line of a list of changes. */
	private static String what(NotificationInbox.Change change) {
		var s = change.snapshot();
		var actor = s.path("actorName").asString("Someone");
		return switch (change.type()) {
			case "ISSUE_UNASSIGNED" -> actor + " unassigned you";
			case "ISSUE_STATUS_CHANGED" -> actor + " moved it " + move(s) + extra(s);
			case "ISSUE_DELETED" -> actor + " deleted it";
			default -> actor + " " + s.path("summary").asString("edited it");
		};
	}

	private static String move(JsonNode snapshot) {
		return IssueNotifications.clean(snapshot.path("fromStatus").asString("")) + " → "
			+ IssueNotifications.clean(snapshot.path("toStatus").asString(""));
	}

	/** A move that came with edits in the same save names them. */
	private static String extra(JsonNode snapshot) {
		var edits = snapshot.path("edits").asString("");
		return edits.isEmpty() ? "" : " (also " + edits + ")";
	}
}
