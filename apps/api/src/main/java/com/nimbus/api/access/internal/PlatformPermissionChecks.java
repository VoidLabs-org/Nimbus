package com.nimbus.api.access.internal;

import java.util.List;
import java.util.UUID;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.Kind;
import com.nimbus.api.access.PlatformPermissions;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Platform permissions come from Everyone and from the platform roles the User was given. */
@Component
@Transactional(readOnly = true)
class PlatformPermissionChecks implements PlatformPermissions {

	private final Catalog catalog;

	private final JdbcClient jdbc;

	PlatformPermissionChecks(Catalog catalog, JdbcClient jdbc) {
		this.catalog = catalog;
		this.jdbc = jdbc;
	}

	@Override
	public boolean holds(UUID userId, String permission) {
		return catalog.find(permission).filter(found -> found.kind() == Kind.PLATFORM).isPresent()
				&& heldBy(userId).contains(permission);
	}

	/** The platform permissions the User holds, sorted; Grants for unknown keys are left out. */
	List<String> heldBy(UUID userId) {
		return jdbc.sql("""
				SELECT DISTINCT g.permission_key FROM access_role_grants g
				JOIN access_roles r ON r.id = g.role_id
				WHERE r.kind = 'PLATFORM' AND (r.key = :everyone OR EXISTS (
				    SELECT 1 FROM access_role_assignments a
				    WHERE a.role_id = r.id AND a.user_id = :user AND a.project_id IS NULL))
				ORDER BY g.permission_key""")
			.param("everyone", BuiltInRole.EVERYONE.key())
			.param("user", userId)
			.query(String.class)
			.list()
			.stream()
			.filter(key -> catalog.find(key).filter(found -> found.kind() == Kind.PLATFORM).isPresent())
			.toList();
	}

}
