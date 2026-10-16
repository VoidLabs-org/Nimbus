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
	 * @param targetExists whether the Role it is about still exists, so the page links only to Roles it can open
	 * @param before {@code null} when there was nothing before (created)
	 * @param after {@code null} when there is nothing after (deleted)
	 */
	record Entry(UUID id, Instant at, UUID actorId, String action, String targetType, String targetKey,
			boolean targetExists, JsonNode before, JsonNode after) {
	}

	/** @param asOf the newest entry this page set covers; pass it back for the next pages so they don't shift */
	record Page(List<Entry> entries, long total, long asOf) {
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

	/**
	 * Records Grants for keys no longer in the catalog: once when one appears, and once when it is gone again (fixed
	 * by a migration, or its Role deleted), so the same Grant going stale later is recorded again. One statement
	 * each, whatever the number of Grants.
	 */
	void recordUnknownGrantChanges() {
		var states = """
				WITH latest AS (
				    SELECT DISTINCT ON (target_key, after ->> 'permission') target_key, after ->> 'permission' AS permission,
				    action FROM access_audit_entries
				    WHERE actor_id IS NULL AND action IN ('catalog.unknown_grant', 'catalog.unknown_grant_resolved')
				    ORDER BY target_key, after ->> 'permission', seq DESC),
				unknown AS (
				    SELECT r.key AS role, g.permission_key AS permission FROM access_role_grants g
				    JOIN access_roles r ON r.id = g.role_id
				    WHERE g.permission_key NOT IN (SELECT key FROM access_permissions))
				""";
		jdbc.sql(states + """
				INSERT INTO access_audit_entries (id, at, actor_id, action, target_type, target_key, before, after)
				SELECT gen_random_uuid(), now(), NULL, 'catalog.unknown_grant_resolved', 'role', l.target_key, NULL,
				jsonb_build_object('permission', l.permission) FROM latest l
				WHERE l.action = 'catalog.unknown_grant'
				AND NOT EXISTS (SELECT 1 FROM unknown u WHERE u.role = l.target_key AND u.permission = l.permission)""")
			.update();
		jdbc.sql(states + """
				INSERT INTO access_audit_entries (id, at, actor_id, action, target_type, target_key, before, after)
				SELECT gen_random_uuid(), now(), NULL, 'catalog.unknown_grant', 'role', u.role, NULL,
				jsonb_build_object('permission', u.permission) FROM unknown u
				LEFT JOIN latest l ON l.target_key = u.role AND l.permission = u.permission
				WHERE l.action IS DISTINCT FROM 'catalog.unknown_grant'""")
			.update();
	}

	/**
	 * Newest first, among entries up to {@code asOf} ({@code null}: the newest there is). Paging within that fixed set
	 * means entries written meanwhile can't shift later pages, and a reader asks for them by starting again.
	 */
	Page page(int page, int size, Long asOf) {
		var newest = asOf != null ? asOf
				: jdbc.sql("SELECT COALESCE(MAX(seq), 0) FROM access_audit_entries").query(Long.class).single();
		var entries = jdbc.sql("""
				SELECT e.id, e.at, e.actor_id, e.action, e.target_type, e.target_key, e.before::text AS before,
				e.after::text AS after, EXISTS (SELECT 1 FROM access_roles r WHERE r.key = e.target_key) AS target_exists
				FROM access_audit_entries e WHERE e.seq <= :asOf ORDER BY e.seq DESC LIMIT :size OFFSET :offset""")
			.param("asOf", newest)
			.param("size", size)
			.param("offset", (long) page * size)
			.query((rs, n) -> new Entry(rs.getObject("id", UUID.class), rs.getTimestamp("at").toInstant(),
					rs.getObject("actor_id", UUID.class), rs.getString("action"), rs.getString("target_type"),
					rs.getString("target_key"), rs.getBoolean("target_exists"), tree(rs.getString("before")),
					tree(rs.getString("after"))))
			.list();
		var total = jdbc.sql("SELECT COUNT(*) FROM access_audit_entries WHERE seq <= :asOf")
			.param("asOf", newest)
			.query(Long.class)
			.single();
		return new Page(entries, total, newest);
	}

	private JsonNode tree(String text) {
		return text == null ? null : json.readTree(text);
	}

}
