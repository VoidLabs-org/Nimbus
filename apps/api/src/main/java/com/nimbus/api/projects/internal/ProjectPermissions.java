package com.nimbus.api.projects.internal;

import java.util.List;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.ModulePermissions;
import com.nimbus.api.access.Permission;
import com.nimbus.api.access.Scope;
import org.springframework.stereotype.Component;

/**
 * The projects module's Permissions (#42). Members always see their own projects, so seeing a project needs no
 * Permission; {@code projects:project:view} only lets platform roles see every project, with Scope All.
 */
@Component
class ProjectPermissions implements ModulePermissions {

	@Override
	public List<Permission> permissions() {
		return List.of(
				Permission.platform("projects:project:create", "Projects", "Create projects")
					.grantedTo(BuiltInRole.EVERYONE),
				Permission.project("projects:project:view", "Projects",
						"See every project, including ones the User is not a Member of"),
				Permission.project("projects:project:update", "Projects", "Rename and describe a project", Scope.PROJECT)
					.grantedTo(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT),
				Permission.project("projects:project:archive", "Projects", "Archive and restore a project",
						Scope.PROJECT)
					.grantedTo(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT),
				Permission.project("projects:member:manage", "Projects",
						"Add and remove Members and change their project role", Scope.PROJECT)
					// Locked: a project always needs someone who can manage its Members.
					.lockedIn(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT));
	}

}
