package com.nimbus.api.access.internal;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.Permission;
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
 * Running it again changes nothing.
 */
@Component
class StartupSync implements SmartInitializingSingleton {

	private static final Logger log = LoggerFactory.getLogger(StartupSync.class);

	private final Catalog catalog;

	private final JdbcClient jdbc;

	private final TransactionTemplate transaction;

	private final PlatformAdminBootstrap platformAdmin;

	StartupSync(Catalog catalog, JdbcClient jdbc, TransactionTemplate transaction, PlatformAdminBootstrap platformAdmin) {
		this.catalog = catalog;
		this.jdbc = jdbc;
		this.transaction = transaction;
		this.platformAdmin = platformAdmin;
	}

	@Override
	public void afterSingletonsInstantiated() {
		run();
	}

	void run() {
		transaction.executeWithoutResult(status -> {
			storeCatalog();
			for (var role : BuiltInRole.values()) {
				syncBuiltIn(role);
			}
			warnAboutUnknownGrants();
		});
		platformAdmin.atStartup();
	}

	private void storeCatalog() {
		jdbc.sql("DELETE FROM access_permissions").update();
		for (var permission : catalog.all()) {
			jdbc.sql("""
					INSERT INTO access_permissions (key, heading, description, kind, scopes, own_hint)
					VALUES (:key, :heading, :description, :kind, :scopes, :ownHint)""")
				.param("key", permission.key())
				.param("heading", permission.heading())
				.param("description", permission.description())
				.param("kind", permission.kind().name())
				.param("scopes", permission.scopes().stream().sorted().map(Scope::name).collect(Collectors.joining(",")))
				.param("ownHint", permission.ownHint())
				.update();
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
		var row = jdbc.sql("SELECT id, customised FROM access_roles WHERE key = :key")
			.param("key", role.key())
			.query((rs, n) -> new Object[] { rs.getObject("id", UUID.class), rs.getBoolean("customised") })
			.single();
		var id = (UUID) row[0];
		// Platform admin is locked: it is never customised and always holds everything.
		if (role != BuiltInRole.PLATFORM_ADMIN && (boolean) row[1]) {
			return;
		}
		var wanted = defaultGrants(role);
		Map<String, String> current = new HashMap<>();
		jdbc.sql("SELECT permission_key, scope FROM access_role_grants WHERE role_id = :id")
			.param("id", id)
			.query(rs -> {
				current.put(rs.getString("permission_key"), rs.getString("scope"));
			});
		if (current.equals(wanted)) {
			return;
		}
		jdbc.sql("DELETE FROM access_role_grants WHERE role_id = :id").param("id", id).update();
		wanted.forEach((key, scope) -> jdbc.sql("""
				INSERT INTO access_role_grants (role_id, permission_key, scope) VALUES (:id, :key, :scope)""")
			.param("id", id)
			.param("key", key)
			.param("scope", scope)
			.update());
		jdbc.sql("UPDATE access_roles SET version = version + 1 WHERE id = :id").param("id", id).update();
	}

	/** Permission key to Scope name ({@code null} for platform permissions). */
	private Map<String, String> defaultGrants(BuiltInRole role) {
		Map<String, String> grants = new HashMap<>();
		for (Permission permission : catalog.all()) {
			if (role == BuiltInRole.PLATFORM_ADMIN) {
				grants.put(permission.key(), permission.kind() == Kind.PLATFORM ? null : Scope.ALL.name());
				continue;
			}
			permission.defaults().stream()
				.filter(grant -> grant.role() == role)
				.forEach(grant -> grants.put(permission.key(), grant.scope() == null ? null : grant.scope().name()));
		}
		return grants;
	}

	private void warnAboutUnknownGrants() {
		jdbc.sql("""
				SELECT r.key AS role, g.permission_key AS permission FROM access_role_grants g
				JOIN access_roles r ON r.id = g.role_id
				WHERE g.permission_key NOT IN (SELECT key FROM access_permissions)
				ORDER BY r.key, g.permission_key""")
			.query(rs -> {
				log.warn("Role {} has a Grant for {}, which is no longer a Permission; it is ignored. Rename or "
						+ "remove it with a migration.", rs.getString("role"), rs.getString("permission"));
			});
	}

}
