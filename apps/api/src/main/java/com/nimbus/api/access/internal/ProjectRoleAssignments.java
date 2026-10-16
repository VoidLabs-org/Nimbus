package com.nimbus.api.access.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.access.NotAProjectRoleException;
import com.nimbus.api.access.ProjectRoles;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Project Role assignments, one per User per project (a unique index guards it). Callers join it to their own
 * transaction. A refused change has written nothing when it throws, so its exceptions don't mark that transaction
 * rollback-only: a caller may catch them and carry on.
 */
@Component
@Transactional(noRollbackFor = { IllegalStateException.class, NotAProjectRoleException.class })
class ProjectRoleAssignments implements ProjectRoles {

	private final JdbcClient jdbc;

	private final RequestMemo memo;

	ProjectRoleAssignments(JdbcClient jdbc, RequestMemo memo) {
		this.jdbc = jdbc;
		this.memo = memo;
	}

	@Override
	public void give(UUID actorId, UUID projectId, UUID userId, String role) {
		var added = jdbc.sql("""
				INSERT INTO access_role_assignments (id, role_id, user_id, project_id, created_at)
				VALUES (:id, :role, :user, :project, :now)
				ON CONFLICT (user_id, project_id) WHERE project_id IS NOT NULL DO NOTHING""")
			.param("id", UUID.randomUUID())
			.param("role", projectRoleId(role))
			.param("user", userId)
			.param("project", projectId)
			.param("now", Timestamp.from(Instant.now()))
			.update();
		if (added == 0) {
			throw new IllegalStateException("User " + userId + " already holds a project role in project " + projectId);
		}
		memo.clear();
	}

	@Override
	public void change(UUID actorId, UUID projectId, UUID userId, String role) {
		var changed = jdbc.sql("""
				UPDATE access_role_assignments SET role_id = :role WHERE user_id = :user AND project_id = :project""")
			.param("role", projectRoleId(role))
			.param("user", userId)
			.param("project", projectId)
			.update();
		if (changed == 0) {
			throw noRole(projectId, userId);
		}
		memo.clear();
	}

	@Override
	public void remove(UUID actorId, UUID projectId, UUID userId) {
		var removed = jdbc.sql("DELETE FROM access_role_assignments WHERE user_id = :user AND project_id = :project")
			.param("user", userId)
			.param("project", projectId)
			.update();
		if (removed == 0) {
			throw noRole(projectId, userId);
		}
		memo.clear();
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<String> roleOf(UUID projectId, UUID userId) {
		return jdbc.sql("""
				SELECT r.key FROM access_role_assignments a JOIN access_roles r ON r.id = a.role_id
				WHERE a.user_id = :user AND a.project_id = :project""")
			.param("user", userId)
			.param("project", projectId)
			.query(String.class)
			.optional();
	}

	private UUID projectRoleId(String role) {
		return jdbc.sql("SELECT id FROM access_roles WHERE key = :key AND kind = 'PROJECT'")
			.param("key", role)
			.query(UUID.class)
			.optional()
			.orElseThrow(() -> new NotAProjectRoleException(role));
	}

	private static IllegalStateException noRole(UUID projectId, UUID userId) {
		return new IllegalStateException("User " + userId + " holds no project role in project " + projectId);
	}

}
