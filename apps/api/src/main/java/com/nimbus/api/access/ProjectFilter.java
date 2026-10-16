package com.nimbus.api.access;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Which records a User may reach with one project permission, for filtering a list in the database. When
 * {@code allProjects} is true, both sets are empty: everything in every project is allowed. A project is in at most
 * one of the sets.
 *
 * @param allProjects the User has {@link Scope#ALL}
 * @param everythingIn projects where the User has {@link Scope#PROJECT}: every record
 * @param ownIn projects where the User has {@link Scope#OWN}: only their own records, as the calling module defines
 * them
 */
public record ProjectFilter(boolean allProjects, Set<UUID> everythingIn, Set<UUID> ownIn) {

	public ProjectFilter {
		everythingIn = Set.copyOf(everythingIn);
		ownIn = Set.copyOf(ownIn);
	}

	/** The Scope this filter allows in one project; empty when none. */
	public Optional<Scope> scopeIn(UUID projectId) {
		if (allProjects) {
			return Optional.of(Scope.ALL);
		}
		if (everythingIn.contains(projectId)) {
			return Optional.of(Scope.PROJECT);
		}
		return ownIn.contains(projectId) ? Optional.of(Scope.OWN) : Optional.empty();
	}

}
