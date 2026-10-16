package com.nimbus.api.access.internal;

import java.time.Instant;
import java.util.UUID;
import java.util.stream.Collectors;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Scope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Brings the database in line with the code at every startup, before the API takes requests: stores the catalog,
 * creates missing built-in Roles, resets the ones nobody customised to the code defaults (Platform admin always),
 * warns about Grants for Permissions that no longer exist, and makes sure the admin email holds Platform admin.
 * Running it again changes nothing, and instances starting at the same time wait for each other.
 */
@Component
class StartupSync implements SmartInitializingSingleton {

	private static final Logger log = LoggerFactory.getLogger(StartupSync.class);

	// Any fixed number, the same in every instance: instances starting together against one database (the
	// shared dev database, or several API instances) take turns instead of colliding on the same rows.
	private static final long LOCK = 0x4e696d6275734143L;

	private final Catalog catalog;

	private final JdbcClient jdbc;

	private final TransactionTemplate transaction;

	private final PlatformAdminBootstrap platformAdmin;

	private final BuiltInDefaults defaults;

	private final GrantStore grants;

	private final AuditLog audit;

	StartupSync(Catalog catalog, JdbcClient jdbc, TransactionTemplate transaction, PlatformAdminBootstrap platformAdmin,
			BuiltInDefaults defaults, GrantStore grants, AuditLog audit) {
		this.catalog = catalog;
		this.jdbc = jdbc;
		this.transaction = transaction;
		this.platformAdmin = platformAdmin;
		this.defaults = defaults;
		this.grants = grants;
		this.audit = audit;
	}

	@Override
	public void afterSingletonsInstantiated() {
		run();
	}

	void run() {
		transaction.executeWithoutResult(status -> {
			jdbc.sql("SELECT pg_advisory_xact_lock(:lock)").param("lock", LOCK).query((rs, n) -> 1).list();
			storeCatalog();
			for (var role : BuiltInRole.values()) {
				syncBuiltIn(role);
			}
			warnAboutUnknownGrants();
		});
		platformAdmin.atStartup();
	}

	/** Upserts the catalog, keeping when each Permission was first seen, and drops keys no longer declared. */
	private void storeCatalog() {
		var now = java.sql.Timestamp.from(Instant.now());
		for (var permission : catalog.all()) {
			jdbc.sql("""
					INSERT INTO access_permissions (key, heading, description, kind, scopes, own_hint, first_seen_at)
					VALUES (:key, :heading, :description, :kind, :scopes, :ownHint, :now)
					ON CONFLICT (key) DO UPDATE SET heading = EXCLUDED.heading, description = EXCLUDED.description,
					kind = EXCLUDED.kind, scopes = EXCLUDED.scopes, own_hint = EXCLUDED.own_hint""")
				.param("key", permission.key())
				.param("heading", permission.heading())
				.param("description", permission.description())
				.param("kind", permission.kind().name())
				.param("scopes", permission.scopes().stream().sorted().map(Scope::name).collect(Collectors.joining(",")))
				.param("ownHint", permission.ownHint())
				.param("now", now)
				.update();
		}
		var keys = catalog.all().stream().map(permission -> permission.key()).toList();
		if (keys.isEmpty()) {
			jdbc.sql("DELETE FROM access_permissions").update();
		}
		else {
			jdbc.sql("DELETE FROM access_permissions WHERE key NOT IN (:keys)").param("keys", keys).update();
		}
	}

	private void syncBuiltIn(BuiltInRole role) {
		jdbc.sql("""
				INSERT INTO access_roles (id, key, name, description, kind, built_in, customised, version, created_at)
				VALUES (:id, :key, :name, :description, :kind, TRUE, FALSE, 0, :now)
				ON CONFLICT (key) DO NOTHING""")
			.param("id", UUID.randomUUID())
			.param("key", role.key())
			.param("name", role.defaultName())
			.param("description", role.defaultDescription())
			.param("kind", role.kind().name())
			.param("now", java.sql.Timestamp.from(Instant.now()))
			.update();
		var row = jdbc.sql("SELECT id, customised, built_in FROM access_roles WHERE key = :key")
			.param("key", role.key())
			.query((rs, n) -> new Object[] { rs.getObject("id", UUID.class), rs.getBoolean("customised"),
					rs.getBoolean("built_in") })
			.single();
		if (!(boolean) row[2]) {
			throw new IllegalStateException("A custom Role uses the key " + role.key() + ", which is now the key of a "
					+ "built-in Role. Rename the custom Role with a migration before starting this version.");
		}
		var id = (UUID) row[0];
		// Platform admin is locked: it is never customised and always holds everything. A customised Role keeps
		// what the admin set, except Grants it must always hold.
		if (role != BuiltInRole.PLATFORM_ADMIN && (boolean) row[1]) {
			defaults.lockedOf(role).forEach((key, scope) -> jdbc.sql("""
					INSERT INTO access_role_grants (role_id, permission_key, scope) VALUES (:id, :key, :scope)
					ON CONFLICT (role_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope""")
				.param("id", id)
				.param("key", key)
				.param("scope", scope)
				.update());
			return;
		}
		var wanted = defaults.grantsOf(role);
		if (grants.of(id).equals(wanted)) {
			return;
		}
		grants.replace(id, wanted);
		jdbc.sql("UPDATE access_roles SET version = version + 1 WHERE id = :id").param("id", id).update();
	}

	private void warnAboutUnknownGrants() {
		jdbc.sql("""
				SELECT r.key AS role, g.permission_key AS permission FROM access_role_grants g
				JOIN access_roles r ON r.id = g.role_id
				WHERE g.permission_key NOT IN (SELECT key FROM access_permissions)
				ORDER BY r.key, g.permission_key""")
			.query(rs -> {
				var role = rs.getString("role");
				var permission = rs.getString("permission");
				log.warn("Role {} has a Grant for {}, which is no longer a Permission; it is ignored. Rename or "
						+ "remove it with a migration.", role, permission);
				// Kept once in the audit log, not again at every startup.
				var details = java.util.Map.of("permission", permission);
				if (!audit.recordedBySystem("catalog.unknown_grant", role, details)) {
					audit.record(null, "catalog.unknown_grant", AuditLog.TargetType.ROLE, role, null, details);
				}
			});
	}

}
