package com.nimbus.api.issues.internal;

import java.util.List;

import com.nimbus.api.access.BuiltInRole;
import com.nimbus.api.access.ModulePermissions;
import com.nimbus.api.access.Permission;
import com.nimbus.api.access.Scope;
import org.springframework.stereotype.Component;

/**
 * The issues module's Permissions (#59). Seeing a project's Issues needs none: Members see their project, and
 * {@code projects:project:view} with Scope All lets platform roles see every project.
 */
@Component
class IssuePermissions implements ModulePermissions {

	static final String CREATE = "issues:issue:create";
	static final String EDIT = "issues:issue:edit";
	static final String DELETE = "issues:issue:delete";
	static final String MANAGE_STATUSES = "issues:status:manage";

	@Override
	public List<Permission> permissions() {
		return List.of(
				Permission.project(CREATE, "Issues", "Create Issues", Scope.PROJECT)
					.grantedTo(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT)
					.grantedTo(BuiltInRole.DEVELOPER, Scope.PROJECT),
				Permission.project(EDIT, "Issues", "Edit Issues, move them between Statuses and assign them",
						Scope.OWN, Scope.PROJECT)
					.ownHint("Issues the User reported or is assigned to")
					.grantedTo(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT)
					.grantedTo(BuiltInRole.DEVELOPER, Scope.PROJECT),
				Permission.project(DELETE, "Issues", "Delete Issues", Scope.OWN, Scope.PROJECT)
					.ownHint("Issues the User reported")
					.grantedTo(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT)
					.grantedTo(BuiltInRole.DEVELOPER, Scope.OWN),
				Permission.project(MANAGE_STATUSES, "Issues", "Add, rename, reorder and remove a project's Statuses",
						Scope.PROJECT)
					.grantedTo(BuiltInRole.PROJECT_ADMIN, Scope.PROJECT));
	}

}
