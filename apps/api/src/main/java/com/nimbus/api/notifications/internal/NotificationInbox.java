package com.nimbus.api.notifications.internal;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
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

	boolean signedIn(UUID userId, UUID sessionId, String title, String deviceLabel, Instant at) {
		return jdbc.sql("""
			INSERT INTO notifications(id, user_id, type, dedupe_key, snapshot, created_at)
			VALUES (:id, :user, 'SIGNED_IN', :dedupe, CAST(:snapshot AS jsonb), :at)
			ON CONFLICT (dedupe_key) DO NOTHING
			""")
			.param("id", UUID.randomUUID()).param("user", userId).param("dedupe", "SIGNED_IN:" + sessionId)
			.param("snapshot", json.writeValueAsString(java.util.Map.of("title", title, "deviceLabel", deviceLabel)))
			.param("at", Timestamp.from(at)).update() == 1;
	}

	Page list(UUID userId, String before, int limit) {
		if (limit < 1 || limit > 100) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100");
		}
		var cursor = before == null ? null : Cursor.parse(before);
		var query = jdbc.sql("SELECT id, type, created_at, read_at, snapshot::text FROM notifications WHERE user_id = :user"
			+ (cursor == null ? "" : " AND (created_at, id) < (:at, :id)")
			+ " ORDER BY created_at DESC, id DESC LIMIT :limit").param("user", userId).param("limit", limit + 1);
		if (cursor != null) {
			query.param("at", Timestamp.from(cursor.at())).param("id", cursor.id());
		}
		var found = query.query((rs, n) -> new Item(rs.getObject("id", UUID.class), rs.getString("type"),
			rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("read_at") != null,
			json.readTree(rs.getString("snapshot")), SECURITY_LINK)).list();
		var items = found.stream().limit(limit).toList();
		var last = items.isEmpty() ? null : items.getLast();
		return new Page(items, found.size() > limit ? new Cursor(last.createdAt(), last.id()).encode() : null);
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
