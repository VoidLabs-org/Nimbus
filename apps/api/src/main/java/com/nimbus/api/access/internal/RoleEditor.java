package com.nimbus.api.access.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.Scope;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates, edits, resets and deletes Roles for the Roles page. Every edit names the version it started from, so a
 * save based on an older version is refused instead of overwriting someone else's change. Editing a built-in Role
 * marks it customised, so startup stops resetting it.
 */
@Component
@Transactional
class RoleEditor {

	private final JdbcClient jdbc;

	private final BuiltInDefaults defaults;

	private final GrantStore grants;

	private final Catalog catalog;

	/** Only Platform admin may hold these, so nobody else can give themselves or others more power. */
	private static final Set<String> RESERVED = Set.of(AccessPermissions.MANAGE_ROLES, AccessPermissions.ASSIGN_ROLES);

	RoleEditor(JdbcClient jdbc, BuiltInDefaults defaults, GrantStore grants, Catalog catalog) {
		this.jdbc = jdbc;
		this.defaults = defaults;
		this.grants = grants;
		this.catalog = catalog;
	}

	static boolean reserved(String permission) {
		return RESERVED.contains(permission);
	}

	/** A Grant as the Roles page sends it: the Scope in lowercase, {@code null} for platform permissions. */
	record RequestedGrant(String permission, String scope) {
	}

	/** Answered with {@code 400}, with what is wrong for each Permission under {@code errors}. */
	static class InvalidGrantsException extends RuntimeException {

		private final Map<String, String> errors;

		InvalidGrantsException(Map<String, String> errors) {
			super("Some Grants don't fit this Role");
			this.errors = errors;
		}

		Map<String, String> errors() {
			return errors;
		}

	}

	/** Answered with {@code 409}: the Role exists, but its state forbids the change. */
	static class RoleConflictException extends RuntimeException {

		RoleConflictException(String message) {
			super(message);
		}

	}

	static class RoleKeyTakenException extends RuntimeException {

		RoleKeyTakenException(String key) {
			super("A Role with the key " + key + " already exists");
		}

	}

	private record Stored(UUID id, String key, Kind kind, boolean builtIn, int version) {
	}

	/** A custom Role with no Grants. */
	void create(String key, String name, String description, Kind kind) {
		var added = jdbc.sql("""
				INSERT INTO access_roles (id, key, name, description, kind, built_in, customised, version, created_at)
				VALUES (:id, :key, :name, :description, :kind, FALSE, FALSE, 0, :now)
				ON CONFLICT (key) DO NOTHING""")
			.param("id", UUID.randomUUID())
			.param("key", key)
			.param("name", name)
			.param("description", description)
			.param("kind", kind.name())
			.param("now", Timestamp.from(Instant.now()))
			.update();
		if (added == 0) {
			throw new RoleKeyTakenException(key);
		}
	}

	/** Changes the name and description; a {@code null} leaves that one as it is. */
	void describe(String key, String name, String description, int version) {
		var role = editable(key, version);
		jdbc.sql("""
				UPDATE access_roles SET name = COALESCE(:name, name), description = COALESCE(:description, description)
				WHERE id = :id""")
			.param("name", name)
			.param("description", description)
			.param("id", role.id())
			.update();
		changed(role);
	}

	/** Replaces all of the Role's Grants with these. */
	void saveGrants(String key, List<RequestedGrant> requested, int version) {
		var role = editable(key, version);
		var wanted = validated(role, requested);
		BuiltInDefaults.builtIn(key).ifPresent(builtIn -> defaults.lockedOf(builtIn).forEach((permission, scope) -> {
			if (!scope.equals(wanted.get(permission))) {
				throw new RoleConflictException(role.key() + " must always hold " + permission + " with Scope "
						+ scope.toLowerCase(Locale.ROOT));
			}
		}));
		grants.replace(role.id(), wanted);
		changed(role);
	}

	/** Permission key to Scope name, if every requested Grant fits the Permission and this kind of Role. */
	private Map<String, String> validated(Stored role, List<RequestedGrant> requested) {
		Map<String, String> errors = new TreeMap<>();
		Map<String, String> wanted = new HashMap<>();
		for (var grant : requested) {
			var key = grant.permission();
			var problem = problem(role, grant);
			if (problem == null && wanted.containsKey(key)) {
				problem = "Listed twice";
			}
			if (problem != null) {
				errors.putIfAbsent(String.valueOf(key), problem);
				continue;
			}
			wanted.put(key, grant.scope() == null ? null : grant.scope().toUpperCase(Locale.ROOT));
		}
		if (!errors.isEmpty()) {
			throw new InvalidGrantsException(errors);
		}
		return wanted;
	}

	private String problem(Stored role, RequestedGrant grant) {
		var permission = grant.permission() == null ? null : catalog.find(grant.permission()).orElse(null);
		if (permission == null) {
			return "No such Permission";
		}
		if (reserved(permission.key())) {
			return "Only Platform admin may hold this";
		}
		Scope scope;
		try {
			scope = grant.scope() == null ? null : Scope.valueOf(grant.scope().toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException e) {
			return "No such Scope: " + grant.scope();
		}
		if (permission.kind() == Kind.PLATFORM) {
			if (role.kind() == Kind.PROJECT) {
				return "A platform permission can't be in a project role";
			}
			return scope == null ? null : "A platform permission has no Scope";
		}
		if (role.kind() == Kind.PLATFORM) {
			return scope == Scope.ALL ? null : "In a platform role, a project permission needs Scope All";
		}
		return scope != null && permission.scopes().contains(scope) ? null
				: "In a project role this needs one of: " + permission.scopes().stream()
					.sorted()
					.map(allowed -> allowed.name().toLowerCase(Locale.ROOT))
					.toList();
	}

	/** Deletes a custom Role, only while nobody holds it, so nobody loses access by accident. */
	void delete(String key) {
		var role = lockedForUpdate(key);
		if (role.builtIn()) {
			throw new RoleConflictException("Built-in Roles can't be deleted");
		}
		var holders = jdbc.sql("SELECT COUNT(*) FROM access_role_assignments WHERE role_id = :id")
			.param("id", role.id())
			.query(Integer.class)
			.single();
		if (holders > 0) {
			throw new RoleConflictException(role.key() + " is held by " + holders
					+ (holders == 1 ? " assignment" : " assignments") + "; take it away from everyone first");
		}
		jdbc.sql("DELETE FROM access_roles WHERE id = :id").param("id", role.id()).update();
	}

	/** Back to the code defaults: Grants, name and description. Built-in Roles only. */
	void reset(String key) {
		var role = lockedForUpdate(key);
		var builtIn = BuiltInDefaults.builtIn(key)
			.orElseThrow(() -> new RoleConflictException("Only built-in Roles have defaults to reset to"));
		grants.replace(role.id(), defaults.grantsOf(builtIn));
		jdbc.sql("""
				UPDATE access_roles SET name = :name, description = :description, customised = FALSE,
				customised_at = NULL, version = version + 1 WHERE id = :id""")
			.param("name", builtIn.defaultName())
			.param("description", builtIn.defaultDescription())
			.param("id", role.id())
			.update();
	}

	/** The Role, locked for this transaction, if it may be edited and nobody changed it since {@code version}. */
	private Stored editable(String key, int version) {
		var role = lockedForUpdate(key);
		if (BuiltInRole.PLATFORM_ADMIN.key().equals(key)) {
			throw new RoleConflictException("Platform admin is locked: it always holds every Permission");
		}
		if (role.version() != version) {
			throw new RoleConflictException("This Role changed since you opened it. Reload it to see the changes.");
		}
		return role;
	}

	/** Bumps the version, and marks a built-in Role customised so startup leaves it alone. */
	private void changed(Stored role) {
		jdbc.sql("""
				UPDATE access_roles SET version = version + 1, customised = customised OR built_in,
				customised_at = CASE WHEN built_in THEN COALESCE(customised_at, now()) END
				WHERE id = :id""")
			.param("id", role.id())
			.update();
	}

	private Stored lockedForUpdate(String key) {
		return jdbc.sql("SELECT id, key, kind, built_in, version FROM access_roles WHERE key = :key FOR UPDATE")
			.param("key", key)
			.query((rs, n) -> new Stored(rs.getObject("id", UUID.class), rs.getString("key"),
					Kind.valueOf(rs.getString("kind")), rs.getBoolean("built_in"), rs.getInt("version")))
			.optional()
			.orElseThrow(() -> new Roles.RoleNotFoundException(key));
	}

}
