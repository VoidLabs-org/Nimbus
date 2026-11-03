package com.nimbus.api.issues.internal;

import java.util.UUID;

import com.nimbus.api.projects.Projects;
import org.springframework.stereotype.Component;

/**
 * The one place that decides whether a User may do something with a project's Issues. For now any Member may do
 * anything; the permission integration replaces this decision with {@code access}'s, without touching the callers.
 * A User who may not even see the project gets "not found", never "forbidden".
 */
@Component
class IssueAccess {

	enum Action {
		VIEW, CREATE, EDIT, DELETE, MANAGE_STATUSES
	}

	private final Projects projects;

	IssueAccess(Projects projects) {
		this.projects = projects;
	}

	void require(UUID actor, UUID projectId, Action action) {
		// Exhaustive on purpose: a new Action fails to compile here until it is given a rule.
		var allowed = switch (action) {
			case VIEW, CREATE, EDIT, DELETE, MANAGE_STATUSES -> projects.isMember(projectId, actor);
		};
		if (!allowed) throw new IssueService.NotFound("Project not found");
	}
}
