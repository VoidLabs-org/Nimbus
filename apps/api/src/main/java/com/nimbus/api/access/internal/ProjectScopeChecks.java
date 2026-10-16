package com.nimbus.api.access.internal;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

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
 * Grant counts only if it {@linkplain Catalog#fits fits} its Permission now; Grants for keys no longer in the catalog
 * allow nothing. Ids must not be null: a project id missing by mistake would otherwise quietly ignore the project
 * role.
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
		Objects.requireNonNull(projectId, "projectId");
		projectPermission(permission);
		return Optional.ofNullable(heldIn(userId, projectId).get(permission));
	}

	private record FilterFor(UUID userId, String permission) {
	}

	/** One Grant the User holds for the Permission: {@code projectId} is null for platform roles and Everyone. */
	private record Held(UUID projectId, Scope scope) {
	}

	@Override
	public ProjectFilter filter(UUID userId, String permission) {
		Objects.requireNonNull(userId, "userId");
		var declared = projectPermission(permission);
		return memo.get(new FilterFor(userId, permission), () -> {
			// Everyone has no assignments; any other Role counts only through one of this User's, a platform role
			// across Nimbus and a project role in its project.
			var held = jdbc.sql("""
					SELECT a.project_id, g.scope, r.kind FROM access_role_grants g
					JOIN access_roles r ON r.id = g.role_id
					LEFT JOIN access_role_assignments a ON a.role_id = r.id AND a.user_id = :user
					    AND (a.project_id IS NULL AND r.kind = 'PLATFORM' OR a.project_id IS NOT NULL AND r.kind = 'PROJECT')
					WHERE g.permission_key = :permission AND g.scope IS NOT NULL
					AND (r.key = :everyone OR a.id IS NOT NULL)""")
				.param("user", userId)
				.param("permission", permission)
				.param("everyone", BuiltInRole.EVERYONE.key())
				.query((rs, n) -> {
					var scope = Scope.valueOf(rs.getString("scope"));
					var fits = Catalog.fits(declared, Kind.valueOf(rs.getString("kind")), scope);
					return fits ? new Held(rs.getObject("project_id", UUID.class), scope) : null;
				})
				.list()
				.stream()
				.filter(Objects::nonNull)
				.toList();
			if (held.stream().anyMatch(grant -> grant.scope() == Scope.ALL)) {
				return new ProjectFilter(true, Set.of(), Set.of());
			}
			Map<UUID, Scope> widest = held.stream()
				.collect(Collectors.toMap(Held::projectId, Held::scope, ProjectScopeChecks::wider));
			return new ProjectFilter(false, projectsWith(widest, Scope.PROJECT), projectsWith(widest, Scope.OWN));
		});
	}

	/** Every project permission the User has in the project, with its widest Scope. */
	Map<String, Scope> heldIn(UUID userId, UUID projectId) {
		Objects.requireNonNull(userId, "userId");
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
					var kind = Kind.valueOf(rs.getString("kind"));
					if (catalog.find(key, Kind.PROJECT).filter(found -> Catalog.fits(found, kind, scope)).isPresent()) {
						widest.merge(key, scope, ProjectScopeChecks::wider);
					}
				});
			return Map.copyOf(widest);
		});
	}

	private static Set<UUID> projectsWith(Map<UUID, Scope> widest, Scope scope) {
		return widest.entrySet().stream()
			.filter(entry -> entry.getValue() == scope)
			.map(Map.Entry::getKey)
			.collect(Collectors.toSet());
	}

	private Permission projectPermission(String key) {
		return catalog.find(key, Kind.PROJECT)
			.orElseThrow(() -> new IllegalArgumentException(key + " is not a project permission"));
	}

	private static Scope wider(Scope a, Scope b) {
		return a.compareTo(b) >= 0 ? a : b;
	}

}
