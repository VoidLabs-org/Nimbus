package com.nimbus.api.access.internal;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Reads Roles and their Grants for the Roles pages. Grants for Permissions no longer in the catalog are left out. */
@Component
@Transactional(readOnly = true)
class Roles {

	private final Catalog catalog;

	private final JdbcClient jdbc;

	private final BuiltInDefaults defaults;

	Roles(Catalog catalog, JdbcClient jdbc, BuiltInDefaults defaults) {
		this.catalog = catalog;
		this.jdbc = jdbc;
		this.defaults = defaults;
	}

	/**
	 * A Grant as the Roles pages show it: the Permission's key and its Scope ({@code null} for platform ones).
	 *
	 * @param locked the Role must always hold it
	 */
	record GrantView(String permission, String scope, boolean locked) {
	}

	/**
	 * A Role and how many Users hold it.
	 *
	 * @param locked nothing about it can be edited (Platform admin)
	 * @param holders {@code null} for Everyone, which every signed-in User holds without being assigned
	 * @param newPermissions for a customised built-in Role: defaults it lacks that appeared after it was customised
	 */
	record RoleView(UUID id, String key, String name, String description, Kind kind, boolean builtIn,
			boolean customised, boolean locked, int version, List<GrantView> grants, Integer holders,
			List<String> newPermissions) {
	}

	static class RoleNotFoundException extends RuntimeException {

		RoleNotFoundException(String key) {
			super("No Role has the key " + key);
		}

	}

	/** Platform roles first, built-in Roles in their usual order, then the rest by name. */
	List<RoleView> all() {
		return load("", Map.of()).stream()
			.sorted(Comparator.comparing(RoleView::kind)
				.thenComparing(role -> builtInOrder(role.key()))
				.thenComparing(role -> role.name().toLowerCase(Locale.ROOT)))
			.toList();
	}

	RoleView require(String key) {
		return load("WHERE r.key = :key", Map.of("key", key)).stream()
			.findFirst()
			.orElseThrow(() -> new RoleNotFoundException(key));
	}

	private record Row(UUID id, String key, String name, String description, Kind kind, boolean builtIn,
			boolean customised, int version, java.time.Instant customisedAt) {
	}

	/** The Roles matching {@code where} (on {@code access_roles r}), with only their own Grants and holders read. */
	private List<RoleView> load(String where, Map<String, Object> params) {
		var rows = jdbc.sql("SELECT r.id, r.key, r.name, r.description, r.kind, r.built_in, r.customised, r.version, "
				+ "r.customised_at FROM access_roles r " + where)
			.params(params)
			.query((rs, n) -> {
				var customisedAt = rs.getTimestamp("customised_at");
				return new Row(rs.getObject("id", UUID.class), rs.getString("key"), rs.getString("name"),
						rs.getString("description"), Kind.valueOf(rs.getString("kind")), rs.getBoolean("built_in"),
						rs.getBoolean("customised"), rs.getInt("version"),
						customisedAt == null ? null : customisedAt.toInstant());
			})
			.list();
		if (rows.isEmpty()) {
			return List.of();
		}
		var ids = rows.stream().map(Row::id).toList();
		var grants = grantsOf(ids);
		var holders = holdersOf(ids);
		var firstSeen = firstSeen();
		return rows.stream().map(row -> {
			var builtIn = BuiltInDefaults.builtIn(row.key());
			var locked = builtIn.map(defaults::lockedOf).orElse(Map.of());
			var held = grants.getOrDefault(row.id(), List.of()).stream()
				.map(grant -> new GrantView(grant.permission(), grant.scope(), locked.containsKey(grant.permission())))
				.toList();
			return new RoleView(row.id(), row.key(), row.name(), row.description(), row.kind(), row.builtIn(),
					row.customised(), builtIn.filter(BuiltInRole.PLATFORM_ADMIN::equals).isPresent(), row.version(),
					held, BuiltInRole.EVERYONE.key().equals(row.key()) ? null : holders.getOrDefault(row.id(), 0),
					newPermissions(row, builtIn.orElse(null), held, firstSeen));
		}).toList();
	}

	private List<String> newPermissions(Row row, BuiltInRole builtIn, List<GrantView> held,
			Map<String, java.time.Instant> firstSeen) {
		if (builtIn == null || !row.customised() || row.customisedAt() == null) {
			return List.of();
		}
		var holds = held.stream().map(GrantView::permission).collect(java.util.stream.Collectors.toSet());
		return defaults.grantsOf(builtIn).keySet().stream()
			.filter(key -> !holds.contains(key))
			.filter(key -> firstSeen.containsKey(key) && firstSeen.get(key).isAfter(row.customisedAt()))
			.sorted()
			.toList();
	}

	private Map<String, java.time.Instant> firstSeen() {
		Map<String, java.time.Instant> firstSeen = new HashMap<>();
		jdbc.sql("SELECT key, first_seen_at FROM access_permissions")
			.query(rs -> {
				firstSeen.put(rs.getString("key"), rs.getTimestamp("first_seen_at").toInstant());
			});
		return firstSeen;
	}

	private Map<UUID, List<GrantView>> grantsOf(List<UUID> roleIds) {
		Map<UUID, List<GrantView>> grants = new HashMap<>();
		jdbc.sql("SELECT role_id, permission_key, scope FROM access_role_grants WHERE role_id IN (:ids) "
				+ "ORDER BY permission_key")
			.param("ids", roleIds)
			.query(rs -> {
				var key = rs.getString("permission_key");
				if (catalog.find(key).isPresent()) {
					var scope = rs.getString("scope");
					grants.computeIfAbsent(rs.getObject("role_id", UUID.class), id -> new ArrayList<>())
						.add(new GrantView(key, scope == null ? null : scope.toLowerCase(Locale.ROOT), false));
				}
			});
		return grants;
	}

	private Map<UUID, Integer> holdersOf(List<UUID> roleIds) {
		Map<UUID, Integer> holders = new HashMap<>();
		jdbc.sql("SELECT role_id, COUNT(*) AS holders FROM access_role_assignments WHERE role_id IN (:ids) "
				+ "GROUP BY role_id")
			.param("ids", roleIds)
			.query(rs -> {
				holders.put(rs.getObject("role_id", UUID.class), rs.getInt("holders"));
			});
		return holders;
	}

	private static int builtInOrder(String key) {
		for (var role : BuiltInRole.values()) {
			if (role.key().equals(key)) {
				return role.ordinal();
			}
		}
		return Integer.MAX_VALUE;
	}

}
