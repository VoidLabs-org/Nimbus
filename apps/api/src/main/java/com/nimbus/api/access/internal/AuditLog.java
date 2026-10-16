package com.nimbus.api.access.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Who changed what in access, and how. Entries are written in the same transaction as the change they describe, so
 * one is never kept without the other, and the table refuses to edit or delete them.
 */
@Component
class AuditLog {

	/** What an entry is about. */
	enum TargetType {

		ROLE

	}

	/**
	 * One entry as read back.
	 *
	 * @param actorId {@code null} when the system did it
	 * @param before {@code null} when there was nothing before (created)
	 * @param after {@code null} when there is nothing after (deleted)
	 */
	record Entry(UUID id, Instant at, UUID actorId, String action, String targetType, String targetKey,
			JsonNode before, JsonNode after) {
	}

	record Page(List<Entry> entries, long total) {
	}

	private final JdbcClient jdbc;

	private final JsonMapper json;

	AuditLog(JdbcClient jdbc, JsonMapper json) {
		this.jdbc = jdbc;
		this.json = json;
	}

	/** Records a change; {@code actorId} {@code null} for the system. */
	void record(UUID actorId, String action, TargetType type, String targetKey, Object before, Object after) {
		jdbc.sql("""
				INSERT INTO access_audit_entries (id, at, actor_id, action, target_type, target_key, before, after)
				VALUES (:id, :at, :actor, :action, :type, :key, CAST(:before AS JSONB), CAST(:after AS JSONB))""")
			.param("id", UUID.randomUUID())
			.param("at", Timestamp.from(Instant.now()))
			.param("actor", actorId)
			.param("action", action)
			.param("type", type.name().toLowerCase(java.util.Locale.ROOT))
			.param("key", targetKey)
			.param("before", before == null ? null : json.writeValueAsString(before))
			.param("after", after == null ? null : json.writeValueAsString(after))
			.update();
	}

	/** Whether the system already recorded this exact entry, so a startup warning is kept once, not every restart. */
	boolean recordedBySystem(String action, String targetKey, Object after) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM access_audit_entries WHERE actor_id IS NULL AND action = :action
				AND target_key = :key AND after = CAST(:after AS JSONB))""")
			.param("action", action)
			.param("key", targetKey)
			.param("after", json.writeValueAsString(after))
			.query(Boolean.class)
			.single();
	}

	/** Newest first. */
	Page page(int page, int size) {
		var entries = jdbc.sql("""
				SELECT id, at, actor_id, action, target_type, target_key, before::text AS before, after::text AS after
				FROM access_audit_entries ORDER BY seq DESC LIMIT :size OFFSET :offset""")
			.param("size", size)
			.param("offset", (long) page * size)
			.query((rs, n) -> new Entry(rs.getObject("id", UUID.class), rs.getTimestamp("at").toInstant(),
					rs.getObject("actor_id", UUID.class), rs.getString("action"), rs.getString("target_type"),
					rs.getString("target_key"), tree(rs.getString("before")), tree(rs.getString("after"))))
			.list();
		var total = jdbc.sql("SELECT COUNT(*) FROM access_audit_entries").query(Long.class).single();
		return new Page(entries, total);
	}

	private JsonNode tree(String text) {
		return text == null ? null : json.readTree(text);
	}

}
