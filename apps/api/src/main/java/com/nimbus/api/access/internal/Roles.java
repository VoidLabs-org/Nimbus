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

	Roles(Catalog catalog, JdbcClient jdbc) {
		this.catalog = catalog;
		this.jdbc = jdbc;
	}

	/** A Grant as the Roles pages show it: the Permission's key and its Scope ({@code null} for platform ones). */
	record GrantView(String permission, String scope) {
	}

	/**
	 * A Role and how many Users hold it.
	 *
	 * @param holders {@code null} for Everyone, which every signed-in User holds without being assigned
	 */
	record RoleView(UUID id, String key, String name, String description, Kind kind, boolean builtIn,
			boolean customised, int version, List<GrantView> grants, Integer holders) {
	}

	static class RoleNotFoundException extends RuntimeException {

		RoleNotFoundException(String key) {
			super("No Role has the key " + key);
		}

	}

	/** Platform roles first, built-in Roles in their usual order, then the rest by name. */
	List<RoleView> all() {
		var grants = grantsByRole();
		var holders = holdersByRole();
		return jdbc.sql("SELECT id, key, name, description, kind, built_in, customised, version FROM access_roles")
			.query((rs, n) -> {
				var id = rs.getObject("id", UUID.class);
				var key = rs.getString("key");
				return new RoleView(id, key, rs.getString("name"), rs.getString("description"),
						Kind.valueOf(rs.getString("kind")), rs.getBoolean("built_in"), rs.getBoolean("customised"),
						rs.getInt("version"), grants.getOrDefault(id, List.of()),
						BuiltInRole.EVERYONE.key().equals(key) ? null : holders.getOrDefault(id, 0));
			})
			.list()
			.stream()
			.sorted(Comparator.comparing(RoleView::kind)
				.thenComparing(role -> builtInOrder(role.key()))
				.thenComparing(role -> role.name().toLowerCase(Locale.ROOT)))
			.toList();
	}

	RoleView require(String key) {
		return all().stream()
			.filter(role -> role.key().equals(key))
			.findFirst()
			.orElseThrow(() -> new RoleNotFoundException(key));
	}

	private Map<UUID, List<GrantView>> grantsByRole() {
		Map<UUID, List<GrantView>> grants = new HashMap<>();
		jdbc.sql("SELECT role_id, permission_key, scope FROM access_role_grants ORDER BY permission_key")
			.query(rs -> {
				var key = rs.getString("permission_key");
				if (catalog.find(key).isPresent()) {
					var scope = rs.getString("scope");
					grants.computeIfAbsent(rs.getObject("role_id", UUID.class), id -> new ArrayList<>())
						.add(new GrantView(key, scope == null ? null : scope.toLowerCase(Locale.ROOT)));
				}
			});
		return grants;
	}

	private Map<UUID, Integer> holdersByRole() {
		Map<UUID, Integer> holders = new HashMap<>();
		jdbc.sql("SELECT role_id, COUNT(*) AS holders FROM access_role_assignments GROUP BY role_id")
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
