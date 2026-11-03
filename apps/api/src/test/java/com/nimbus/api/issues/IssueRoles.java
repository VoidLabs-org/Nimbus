package com.nimbus.api.issues;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Project creation does not give the creator a project role yet (#49), so tests that need one set it up directly.
 */
final class IssueRoles {

	private IssueRoles() {
	}

	static void give(JdbcClient jdbc, String projectKey, String userId, String role) {
		jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT gen_random_uuid(), r.id, :user, p.id, now() FROM access_roles r, projects p
				WHERE r.key = :role AND p.key = :key
				""").param("user", UUID.fromString(userId)).param("role", role).param("key", projectKey).update();
	}

}
