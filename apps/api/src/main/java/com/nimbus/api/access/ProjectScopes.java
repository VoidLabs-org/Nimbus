package com.nimbus.api.access;

import java.util.Optional;
import java.util.UUID;

/**
 * How far a User may go with a project permission: the widest Scope ({@link Scope#ALL} > {@link Scope#PROJECT} >
 * {@link Scope#OWN}) among the Grants in their project role in that project, their platform roles and Everyone.
 * {@code access} never looks at records: with {@link Scope#OWN} the calling module decides which records are the
 * User's own. Answers are remembered until the end of the current request, never across requests.
 */
public interface ProjectScopes {

	/**
	 * The widest Scope the User has for the Permission in the project; empty when none.
	 *
	 * @throws IllegalArgumentException if {@code permission} is not a project permission in the catalog
	 */
	Optional<Scope> scope(UUID userId, UUID projectId, String permission);

	/** The widest Scope, or {@link PermissionDeniedException} when the User has none. */
	default Scope require(UUID userId, UUID projectId, String permission) {
		return scope(userId, projectId, permission).orElseThrow(() -> new PermissionDeniedException(permission));
	}

	/**
	 * Which projects' records the User may reach with the Permission, for a list query.
	 *
	 * @throws IllegalArgumentException if {@code permission} is not a project permission in the catalog
	 */
	ProjectFilter filter(UUID userId, String permission);

}
