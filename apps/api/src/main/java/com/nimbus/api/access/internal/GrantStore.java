package com.nimbus.api.access.internal;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Reads and replaces a Role's Grants as permission key to Scope name ({@code null} for platform permissions). */
@Component
class GrantStore {

	private final JdbcClient jdbc;

	GrantStore(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	Map<String, String> of(UUID roleId) {
		Map<String, String> grants = new HashMap<>();
		jdbc.sql("SELECT permission_key, scope FROM access_role_grants WHERE role_id = :id")
			.param("id", roleId)
			.query(rs -> {
				grants.put(rs.getString("permission_key"), rs.getString("scope"));
			});
		return grants;
	}

	void replace(UUID roleId, Map<String, String> grants) {
		jdbc.sql("DELETE FROM access_role_grants WHERE role_id = :id").param("id", roleId).update();
		grants.forEach((key, scope) -> jdbc.sql("""
				INSERT INTO access_role_grants (role_id, permission_key, scope) VALUES (:id, :key, :scope)""")
			.param("id", roleId)
			.param("key", key)
			.param("scope", scope)
			.update());
	}

}
