package com.nimbus.api.notifications.internal;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Stores snapshots and scopes every read or update to its recipient. */
@Component
class NotificationInbox {

	private final JdbcClient jdbc;
	private final JsonMapper json;

	NotificationInbox(JdbcClient jdbc, JsonMapper json) {
		this.jdbc = jdbc;
		this.json = json;
	}

	/** Where a Security alert Notification takes the User. */
	static final String SECURITY_LINK = "/settings/security";

	record Item(UUID id, String type, Instant createdAt, boolean read, JsonNode snapshot, String link) {
	}

	record Page(List<Item> items, String nextCursor) {
	}

	/**
	 * Stores a Notification unless one with the same dedupe key exists, so repeated or concurrent delivery of an
	 * event creates one.
	 *
	 * @return whether this call created it
	 */
	boolean add(UUID userId, String type, String dedupeKey, Map<String, String> snapshot, Instant at) {
		return add(userId, type, dedupeKey, snapshot, at, null, null, null);
	}

	/** Like {@link #add(UUID, String, String, Map, Instant)}, for a Notification about an Issue, which links to it. */
	boolean add(UUID userId, String type, String dedupeKey, Map<String, String> snapshot, Instant at, UUID projectId,
			String issueKey, UUID actorId) {
		return jdbc.sql("""
			INSERT INTO notifications(id, user_id, type, dedupe_key, snapshot, created_at, project_id, issue_key, actor_id)
			VALUES (:id, :user, :type, :dedupe, CAST(:snapshot AS jsonb), :at, :project, :issueKey, :actor)
			ON CONFLICT (dedupe_key) DO NOTHING
			""")
			.param("id", UUID.randomUUID()).param("user", userId).param("type", type).param("dedupe", dedupeKey)
			.param("snapshot", json.writeValueAsString(snapshot))
			.param("at", Timestamp.from(at)).param("project", projectId).param("issueKey", issueKey)
			.param("actor", actorId).update() == 1;
	}

	/** A change is emailed this long after the last change to the same Issue for the same User. */
	static final Duration EMAIL_QUIET = Duration.ofMinutes(3);

	/** ...but never later than this long after the first change of the group. */
	static final Duration EMAIL_CAP = Duration.ofMinutes(10);

	/**
	 * Queues the email of a stored Notification with the User's unsent changes to the same Issue: the whole group is
	 * due {@link #EMAIL_QUIET} after {@code now}, but not later than {@link #EMAIL_CAP} after the group's first change.
	 */
	void scheduleEmail(UUID userId, UUID projectId, String issueKey, String dedupeKey, Instant now) {
		// Concurrent events for the same User and Issue would each read the group before the other commits.
		jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:group, 0))")
			.param("group", userId + "/" + projectId + "/" + issueKey).query().singleRow();
		var started = jdbc.sql("""
			SELECT min(email_group_started_at) FROM notifications
			WHERE user_id = :user AND project_id = :project AND issue_key = :issueKey
				AND emailed_at IS NULL AND email_due_at IS NOT NULL
			""").param("user", userId).param("project", projectId).param("issueKey", issueKey)
			.query(Timestamp.class).optional().map(Timestamp::toInstant).orElse(now);
		var quiet = now.plus(EMAIL_QUIET);
		var cap = started.plus(EMAIL_CAP);
		jdbc.sql("""
			UPDATE notifications SET email_due_at = :due, email_group_started_at = :started
			WHERE dedupe_key = :dedupe OR (user_id = :user AND project_id = :project AND issue_key = :issueKey
				AND emailed_at IS NULL AND email_due_at IS NOT NULL)
			""").param("due", Timestamp.from(quiet.isBefore(cap) ? quiet : cap)).param("started", Timestamp.from(started))
			.param("dedupe", dedupeKey).param("user", userId).param("project", projectId).param("issueKey", issueKey)
			.update();
	}

	/** One Notification of a group whose email is due. */
	record Change(UUID userId, UUID projectId, String issueKey, String type, Instant at, JsonNode snapshot) {
	}

	/**
	 * Marks every group that is due at {@code now} as emailed and returns its changes, oldest first. Claiming and
	 * marking is one statement, so a group is returned to one caller even when instances run this together.
	 */
	List<Change> claimDueEmails(Instant now) {
		return jdbc.sql("""
			UPDATE notifications SET emailed_at = :now
			WHERE emailed_at IS NULL AND email_due_at <= :now
			RETURNING user_id, project_id, issue_key, type, created_at, id, snapshot::text AS snapshot
			""").param("now", Timestamp.from(now))
			.query((rs, n) -> new Change(rs.getObject("user_id", UUID.class), rs.getObject("project_id", UUID.class),
				rs.getString("issue_key"), rs.getString("type"), rs.getTimestamp("created_at").toInstant(),
				json.readTree(rs.getString("snapshot"))))
			.list().stream().sorted(java.util.Comparator.comparing(Change::at)).toList();
	}

	Page list(UUID userId, String before, int limit) {
		if (limit < 1 || limit > 100) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100");
		}
		var cursor = before == null ? null : Cursor.parse(before);
		var query = jdbc.sql("""
				SELECT n.id, n.type, n.created_at, n.read_at, n.snapshot::text AS snapshot, n.issue_key, d.project_key
				FROM notifications n
				LEFT JOIN notification_deleted_issues d ON d.project_id = n.project_id AND d.issue_key = n.issue_key
				WHERE n.user_id = :user"""
			+ (cursor == null ? "" : " AND (n.created_at, n.id) < (:at, :id)")
			+ " ORDER BY n.created_at DESC, n.id DESC LIMIT :limit").param("user", userId).param("limit", limit + 1);
		if (cursor != null) {
			query.param("at", Timestamp.from(cursor.at())).param("id", cursor.id());
		}
		var found = query.query((rs, n) -> new Item(rs.getObject("id", UUID.class), rs.getString("type"),
			rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("read_at") != null,
			json.readTree(rs.getString("snapshot")),
			link(rs.getString("issue_key"), rs.getString("project_key")))).list();
		var items = found.stream().limit(limit).toList();
		var last = items.isEmpty() ? null : items.getLast();
		return new Page(items, found.size() > limit ? new Cursor(last.createdAt(), last.id()).encode() : null);
	}

	/**
	 * Remembers that an Issue is gone, so every Notification about it, older ones included, links to its project.
	 * Repeating it changes nothing.
	 */
	void issueDeleted(UUID projectId, String issueKey, String projectKey) {
		jdbc.sql("""
			INSERT INTO notification_deleted_issues(project_id, issue_key, project_key) VALUES (:project, :issueKey, :projectKey)
			ON CONFLICT DO NOTHING
			""").param("project", projectId).param("issueKey", issueKey).param("projectKey", projectKey).update();
	}

	/** A deleted Issue can't be opened, so a Notification about one takes the User to its project instead. */
	private static String link(String issueKey, String deletedFromProject) {
		if (issueKey == null) return SECURITY_LINK;
		if (deletedFromProject != null) return "/projects/" + deletedFromProject;
		return "/issues/" + issueKey;
	}

	long unreadCount(UUID userId) {
		return jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :user AND read_at IS NULL")
			.param("user", userId).query(Long.class).single();
	}

	void read(UUID userId, UUID id, Instant at) {
		var updated = jdbc.sql("UPDATE notifications SET read_at = COALESCE(read_at, :at) WHERE user_id = :user AND id = :id")
			.param("at", Timestamp.from(at)).param("user", userId).param("id", id).update();
		if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
	}

	void readAll(UUID userId, Instant at) {
		jdbc.sql("UPDATE notifications SET read_at = :at WHERE user_id = :user AND read_at IS NULL")
			.param("at", Timestamp.from(at)).param("user", userId).update();
	}

	private record Cursor(Instant at, UUID id) {
		String encode() {
			return Base64.getUrlEncoder().withoutPadding().encodeToString((at + "/" + id).getBytes(StandardCharsets.UTF_8));
		}

		static Cursor parse(String encoded) {
			try {
				var parts = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8).split("/", -1);
				if (parts.length != 2) throw new IllegalArgumentException();
				return new Cursor(Instant.parse(parts[0]), UUID.fromString(parts[1]));
			}
			catch (RuntimeException e) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid notification cursor");
			}
		}
	}
}
