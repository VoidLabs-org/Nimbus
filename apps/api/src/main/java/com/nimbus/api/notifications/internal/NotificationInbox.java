package com.nimbus.api.notifications.internal;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
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
