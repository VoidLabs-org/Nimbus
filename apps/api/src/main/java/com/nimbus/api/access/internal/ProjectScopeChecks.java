package com.nimbus.api.access.internal;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.Permission;
import com.nimbus.api.access.ProjectFilter;
import com.nimbus.api.access.ProjectScopes;
import com.nimbus.api.access.Scope;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Combines the User's project role in the project with their platform roles and Everyone, widest Scope winning. A
 * Grant counts only with a Scope that fits it now: {@code ALL} in a platform role, one of the Permission's allowed
 * Scopes in a project role. Grants for keys no longer in the catalog allow nothing.
 */
@Component
@Transactional(readOnly = true)
class ProjectScopeChecks implements ProjectScopes {

	private final Catalog catalog;

	private final JdbcClient jdbc;

	private final RequestMemo memo;

	ProjectScopeChecks(Catalog catalog, JdbcClient jdbc, RequestMemo memo) {
		this.catalog = catalog;
		this.jdbc = jdbc;
		this.memo = memo;
	}

	private record HeldIn(UUID userId, UUID projectId) {
	}

	@Override
	public Optional<Scope> scope(UUID userId, UUID projectId, String permission) {
		projectPermission(permission);
		return Optional.ofNullable(heldIn(userId, projectId).get(permission));
	}

	private record FilterFor(UUID userId, String permission) {
	}

	@Override
	public ProjectFilter filter(UUID userId, String permission) {
		projectPermission(permission);
		return memo.get(new FilterFor(userId, permission), () -> {
			var all = new boolean[1];
			Set<UUID> everythingIn = new HashSet<>();
			Set<UUID> ownIn = new HashSet<>();
			// Everyone has no assignments; any other Role counts only through one of this User's.
			jdbc.sql("""
					SELECT a.project_id, g.scope, r.kind FROM access_role_grants g
					JOIN access_roles r ON r.id = g.role_id
					LEFT JOIN access_role_assignments a ON a.role_id = r.id AND a.user_id = :user
					WHERE g.permission_key = :permission AND g.scope IS NOT NULL
					AND (r.key = :everyone OR a.id IS NOT NULL)""")
				.param("user", userId)
				.param("permission", permission)
				.param("everyone", BuiltInRole.EVERYONE.key())
				.query(rs -> {
					var scope = Scope.valueOf(rs.getString("scope"));
					if (!counts(permission, scope, Kind.valueOf(rs.getString("kind")))) {
						return;
					}
					switch (scope) {
						case ALL -> all[0] = true;
						case PROJECT -> everythingIn.add(rs.getObject("project_id", UUID.class));
						case OWN -> ownIn.add(rs.getObject("project_id", UUID.class));
					}
				});
			if (all[0]) {
				return new ProjectFilter(true, Set.of(), Set.of());
			}
			ownIn.removeAll(everythingIn);
			return new ProjectFilter(false, everythingIn, ownIn);
		});
	}

	/** Every project permission the User has in the project, with its widest Scope. */
	Map<String, Scope> heldIn(UUID userId, UUID projectId) {
		return memo.get(new HeldIn(userId, projectId), () -> {
			Map<String, Scope> widest = new HashMap<>();
			jdbc.sql("""
					SELECT g.permission_key, g.scope, r.kind FROM access_role_grants g
					JOIN access_roles r ON r.id = g.role_id
					WHERE g.scope IS NOT NULL AND (r.key = :everyone OR EXISTS (
					    SELECT 1 FROM access_role_assignments a WHERE a.role_id = r.id AND a.user_id = :user
					    AND (a.project_id IS NULL AND r.kind = 'PLATFORM' OR a.project_id = :project AND r.kind = 'PROJECT')))""")
				.param("everyone", BuiltInRole.EVERYONE.key())
				.param("user", userId)
				.param("project", projectId)
				.query(rs -> {
					var key = rs.getString("permission_key");
					var scope = Scope.valueOf(rs.getString("scope"));
					if (counts(key, scope, Kind.valueOf(rs.getString("kind")))) {
						widest.merge(key, scope, ProjectScopeChecks::wider);
					}
				});
			return Map.copyOf(widest);
		});
	}

	/** Whether a Grant of this Permission with this Scope, in this kind of Role, allows anything. */
	private boolean counts(String key, Scope scope, Kind roleKind) {
		return catalog.find(key)
			.filter(permission -> permission.kind() == Kind.PROJECT)
			.filter(permission -> roleKind == Kind.PLATFORM ? scope == Scope.ALL : permission.scopes().contains(scope))
			.isPresent();
	}

	private Permission projectPermission(String key) {
		return catalog.find(key)
			.filter(permission -> permission.kind() == Kind.PROJECT)
			.orElseThrow(() -> new IllegalArgumentException(key + " is not a project permission"));
	}

	private static Scope wider(Scope a, Scope b) {
		return a.compareTo(b) >= 0 ? a : b;
	}

}
