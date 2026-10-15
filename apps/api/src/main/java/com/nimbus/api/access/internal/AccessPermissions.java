package com.nimbus.api.access.internal;

import java.util.List;

import com.nimbus.api.access.ModulePermissions;
import com.nimbus.api.access.Permission;
import org.springframework.stereotype.Component;

/**
 * The access module's own Permissions. Managing and assigning Roles are reserved to Platform admin, so nobody can
 * give themselves more power; reading the audit log can be given to others.
 */
@Component
class AccessPermissions implements ModulePermissions {

	static final String MANAGE_ROLES = "access:role:manage";

	static final String ASSIGN_ROLES = "access:role:assign";

	static final String VIEW_AUDIT = "access:audit:view";

	@Override
	public List<Permission> permissions() {
		return List.of(
				Permission.platform(MANAGE_ROLES, "Access", "Create, edit and delete Roles and their Grants"),
				Permission.platform(ASSIGN_ROLES, "Access", "Give and take platform roles"),
				Permission.platform(VIEW_AUDIT, "Access", "Read the audit log"));
	}

}
