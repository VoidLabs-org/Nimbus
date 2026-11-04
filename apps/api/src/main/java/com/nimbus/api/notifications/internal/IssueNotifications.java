package com.nimbus.api.notifications.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.identity.UserSummary;
import com.nimbus.api.identity.Users;
import com.nimbus.api.issues.IssueChanged;
import com.nimbus.api.issues.IssueCreated;
import com.nimbus.api.issues.IssueDeleted;
import com.nimbus.api.mail.Mail;
import com.nimbus.api.mail.MailAssets;
import com.nimbus.api.mail.Mailer;
import com.nimbus.api.mail.NoticeMail;
import com.nimbus.api.projects.Projects;
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
	private final Projects projects;
	private final Mailer mailer;
	private final MailAssets assets;
	private final Clock clock;
	private final String publicUrl;

	IssueNotifications(NotificationInbox inbox, NotificationSettings settings, Users users, Projects projects,
			Mailer mailer, MailAssets assets, Clock clock, @Value("${nimbus.auth.public-url}") String publicUrl) {
		this.inbox = inbox;
		this.settings = settings;
		this.users = users;
		this.projects = projects;
		this.mailer = mailer;
		this.assets = assets;
		this.clock = clock;
		this.publicUrl = publicUrl.replaceAll("/+$", "");
	}

	/** Only the Assignee hears about being assigned, and not when they assigned themselves. */
	@ApplicationModuleListener
	void on(IssueCreated event) {
		if (event.assigneeId() == null || event.assigneeId().equals(event.actorId())) return;
		var source = new Source(event.projectId(), event.actorId(), clock.instant(), event.issueKey(), event.title(),
			actor(event.actorId()));
		deliver(event.assigneeId(), NotificationSettings.IssueType.ISSUE_ASSIGNED,
			"ISSUE_ASSIGNED:" + event.projectId() + ":" + event.issueKey() + ":created", source, "", Map.of());
	}

	/**
	 * A reassignment tells the old Assignee and the new one; every edit of the title, description, priority or
	 * Assignee gives the Reporter and the current Assignee one {@code ISSUE_EDITED} naming all of them, and a Status
	 * move gives them one {@code ISSUE_STATUS_CHANGED} instead, which also covers any edits in the same save. Nobody gets
	 * more than one Notification per event, nor one about their own change. Type changes notify nobody.
	 */
	@ApplicationModuleListener
	void on(IssueChanged event) {
		var assignee = event.changes().stream().filter(c -> c.field().equals("assignee")).findFirst().orElse(null);
		var status = event.changes().stream().filter(c -> c.field().equals("status")).findFirst().orElse(null);
		var edited = event.changes().stream().map(IssueChanged.Change::field)
			.filter(f -> List.of("title", "description", "priority", "assignee").contains(f)).toList();
		// Type changes notify nobody, so they skip the lookups.
		if (assignee == null && status == null && edited.isEmpty()) return;
		var source = new Source(event.projectId(), event.actorId(), event.at(), event.issueKey(), event.title(),
			actor(event.actorId()));
		var told = new LinkedHashSet<UUID>();
		told.add(event.actorId());
		if (assignee != null) {
			var before = assignee.before() == null ? null : UUID.fromString(assignee.before());
			var after = assignee.after() == null ? null : UUID.fromString(assignee.after());
			if (before != null && told.add(before)) {
				deliver(before, NotificationSettings.IssueType.ISSUE_UNASSIGNED, key("ISSUE_UNASSIGNED", before, event),
					source, "", Map.of());
			}
			if (after != null && told.add(after)) {
				deliver(after, NotificationSettings.IssueType.ISSUE_ASSIGNED, key("ISSUE_ASSIGNED", after, event),
					source, "", Map.of());
			}
		}
		var summary = edited.isEmpty() ? "" : edited.equals(List.of("assignee")) ? "changed the Assignee"
			: "edited " + names(edited.stream().map(f -> f.equals("assignee") ? "Assignee" : f).toList());
		if (status != null) {
			var move = clean(status.before()) + " → " + clean(status.after());
			var extra = new LinkedHashMap<String, String>();
			extra.put("fromStatus", status.before());
			extra.put("toStatus", status.after());
			if (status.categories() != null) {
				extra.put("fromCategory", status.categories().before());
				extra.put("toCategory", status.categories().after());
			}
			// A save that also edits fields still gives one Notification, which shows the move and names the edits.
			if (!summary.isEmpty()) extra.put("edits", summary);
			for (var recipient : new UUID[] { event.reporterId(), event.assigneeId() }) {
				if (recipient == null || !told.add(recipient)) continue;
				deliver(recipient, NotificationSettings.IssueType.ISSUE_STATUS_CHANGED,
					key("ISSUE_STATUS_CHANGED", recipient, event), source, move, extra);
			}
		}
		if (edited.isEmpty()) return;
		for (var recipient : new UUID[] { event.reporterId(), event.assigneeId() }) {
			if (recipient == null || !told.add(recipient)) continue;
			deliver(recipient, NotificationSettings.IssueType.ISSUE_EDITED, key("ISSUE_EDITED", recipient, event),
				source, summary, Map.of());
		}
	}

	/**
	 * The Reporter and the Assignee it had when it was deleted, never the person who deleted it. Every Notification
	 * about the Issue then links to its project, since the Issue can't be opened.
	 */
	@ApplicationModuleListener
	void on(IssueDeleted event) {
		inbox.issueDeleted(event.projectId(), event.issueKey(), event.projectKey());
		var source = new Source(event.projectId(), event.actorId(), event.at(), event.issueKey(), event.title(),
			actor(event.actorId()), "Open project " + clean(event.projectName()), "/projects/" + event.projectKey());
		var told = new LinkedHashSet<UUID>();
		told.add(event.actorId());
		for (var recipient : new UUID[] { event.reporterId(), event.assigneeId() }) {
			if (recipient == null || !told.add(recipient)) continue;
			deliver(recipient, NotificationSettings.IssueType.ISSUE_DELETED,
				"ISSUE_DELETED:" + event.projectId() + ":" + event.issueKey() + ":" + recipient, source, "",
				Map.of("projectKey", event.projectKey(), "projectName", clean(event.projectName())));
		}
	}

	private static String key(String type, UUID recipient, IssueChanged event) {
		return type + ":" + event.projectId() + ":" + event.issueKey() + ":" + recipient + ":" + event.at();
	}

	/** "title", "title and priority", "title, description and priority". */
	private static String names(List<String> names) {
		if (names.size() == 1) return names.getFirst();
		return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.getLast();
	}

	private Optional<UserSummary> actor(UUID actorId) {
		return users.findAllById(List.of(actorId)).stream().findFirst();
	}

	/**
	 * What every Notification of one event shares: where it happened, who did it, the Issue as it was then, and the
	 * email's button and the path it opens.
	 */
	private record Source(UUID projectId, UUID actorId, Instant at, String issueKey, String title,
			Optional<UserSummary> actor, String button, String path) {

		/** For an Issue that still exists, whose email opens it. */
		Source(UUID projectId, UUID actorId, Instant at, String issueKey, String title, Optional<UserSummary> actor) {
			this(projectId, actorId, at, issueKey, title, actor, "Open " + issueKey, "/issues/" + issueKey);
		}
	}

	/** Status names are user-defined, so line breaks and length are dealt with before they reach a subject line. */
	static String clean(String value) {
		var text = value == null ? "" : value.replaceAll("\\p{Cntrl}+", " ").strip();
		return text.length() > 60 ? text.substring(0, 59) + "…" : text;
	}

	/**
	 * {@code summary} is kept in the snapshot for {@code ISSUE_EDITED}, and for
	 * {@code ISSUE_STATUS_CHANGED} the move is shown from {@code extra}, which is kept in the snapshot as it is.
	 */
	private void deliver(UUID recipientId, NotificationSettings.IssueType type, String dedupeKey, Source source,
			String summary, Map<String, String> extra) {
		var projectId = source.projectId();
		var actorId = source.actorId();
		var at = source.at();
		var issueKey = source.issueKey();
		var title = source.title();
		var actor = source.actor();
		var recipient = users.findAllById(List.of(recipientId)).stream().findFirst();
		// An unverified address may belong to someone else, and they can't open the inbox anyway.
		if (recipient.isEmpty() || !recipient.get().emailVerified()) return;
		// A Reporter or Assignee who has left the project may no longer see its Issues, titles included.
		if (!projects.isMember(projectId, recipientId)) return;
		var actorName = actor.map(UserSummary::displayName).orElse("Someone");
		var snapshot = new LinkedHashMap<String, String>();
		snapshot.put("actorName", actorName);
		actor.map(UserSummary::avatarUrl).ifPresent(url -> snapshot.put("actorAvatarUrl", url));
		snapshot.put("issueKey", issueKey);
		snapshot.put("title", title);
		if (type == NotificationSettings.IssueType.ISSUE_EDITED) snapshot.put("summary", summary);
		snapshot.putAll(extra);
		if (!inbox.add(recipientId, type.name(), dedupeKey, snapshot, at, projectId, issueKey, actorId)) return;
		// A move that also edited fields is mailed if the Recipient wants either kind.
		var mailed = settings.emailOn(recipientId, type) || extra.containsKey("edits")
			&& settings.emailOn(recipientId, NotificationSettings.IssueType.ISSUE_EDITED);
		if (!mailed) return;
		// A grouped type waits to be gathered with the User's other changes to this Issue; see IssueEmails.
		if (type.grouped()) {
			inbox.scheduleEmail(recipientId, projectId, issueKey, dedupeKey, clock.instant());
			return;
		}
		var message = mail(recipient.get().email(), actorName, source);
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

	/** The email of {@code ISSUE_ASSIGNED}, the only type sent right away. */
	private Mail mail(String to, String actorName, Source source) {
		var subject = actorName + " assigned you " + source.issueKey();
		var line = subject + " · " + source.title() + ".";
		var button = source.button();
		var url = publicUrl + source.path();
		return new Mail(to, subject,
			NoticeMail.html(subject, "Assigned to you", line, Optional.empty(), button, url, FOOTER,
				assets.url(MailAssets.NIMBUS_ICON_DARK)),
			line + "\n\n" + button + ": " + url + "\n\n" + FOOTER);
	}
}
