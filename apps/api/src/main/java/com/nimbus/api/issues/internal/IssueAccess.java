package com.nimbus.api.issues.internal;

import java.util.UUID;

import com.nimbus.api.access.PermissionDeniedException;
import com.nimbus.api.access.ProjectScopes;
import com.nimbus.api.access.Scope;
import com.nimbus.api.projects.Projects;
import org.springframework.stereotype.Component;

/**
 * The one place that decides whether a User may do something with a project's Issues, by asking {@code access}.
 * A User who may not even see the project gets "not found", never "forbidden": that is anyone who is not a Member
 * and does not hold {@code projects:project:view} with Scope All.
 */
@Component
class IssueAccess {

	enum Action {
		VIEW, CREATE, EDIT, DELETE, MANAGE_STATUSES
	}

	private final Projects projects;
	private final ProjectScopes scopes;

	IssueAccess(Projects projects, ProjectScopes scopes) {
		this.projects = projects;
		this.scopes = scopes;
	}

	/**
	 * Checks the project is visible and the User has the Action's Permission, and returns its Scope. With
	 * {@link Scope#OWN} (edit, delete) the caller must then check the record with {@link #requireOwn}.
	 */
	Scope require(UUID actor, UUID projectId, Action action) {
		var visible = projects.isMember(projectId, actor)
				|| scopes.scope(actor, projectId, "projects:project:view").filter(scope -> scope == Scope.ALL).isPresent();
		if (!visible) throw new IssueService.NotFound("Project not found");
		// Exhaustive on purpose: a new Action fails to compile here until it is given a rule.
		var permission = switch (action) {
			case VIEW -> null;
			case CREATE -> IssuePermissions.CREATE;
			case EDIT -> IssuePermissions.EDIT;
			case DELETE -> IssuePermissions.DELETE;
			case MANAGE_STATUSES -> IssuePermissions.MANAGE_STATUSES;
		};
		return permission == null ? Scope.PROJECT : scopes.require(actor, projectId, permission);
	}

	/** For Scope Own: editing is for the Reporter or the Assignee, deleting for the Reporter only. */
	void requireOwn(Scope scope, Action action, UUID actor, UUID reporterId, UUID assigneeId) {
		if (scope != Scope.OWN) return;
		var own = actor.equals(reporterId) || action == Action.EDIT && actor.equals(assigneeId);
		if (!own) {
			throw new PermissionDeniedException(action == Action.EDIT ? IssuePermissions.EDIT : IssuePermissions.DELETE);
		}
	}
}
