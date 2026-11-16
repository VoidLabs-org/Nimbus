package com.nimbus.api.issues;

import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Creating a project makes its creator Project admin, so tests that need another role set it up directly, replacing
 * whatever role the User held.
 */
final class IssueRoles {

	private IssueRoles() {
	}

	static void give(JdbcClient jdbc, String projectKey, String userId, String role) {
		jdbc.sql("""
				DELETE FROM access_role_assignments WHERE user_id = :user
				AND project_id = (SELECT id FROM projects WHERE key = :key)
				""").param("user", UUID.fromString(userId)).param("key", projectKey).update();
		jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				SELECT gen_random_uuid(), r.id, :user, p.id, now() FROM access_roles r, projects p
				WHERE r.key = :role AND p.key = :key
				""").param("user", UUID.fromString(userId)).param("role", role).param("key", projectKey).update();
	}

}
