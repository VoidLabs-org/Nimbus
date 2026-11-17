package com.nimbus.api.access;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Gives, changes and removes the project role a User holds in a project: at most one per User per project. The
 * module that owns Members calls it in the same transaction as the Member change, so the two are saved together.
 * {@code access} stores only the ids and never checks that the User or project exists.
 *
 * <p>{@code actorId} is who made the change, {@code null} for the system (such as a backfill at startup); it is for
 * the audit log: {@code give}, {@code change} and {@code remove} each write an entry in the caller's transaction.
 */
public interface ProjectRoles {

	/**
	 * @throws NotAProjectRoleException if {@code role} is not the key of a project role
	 * @throws IllegalStateException if the User already holds a project role in this project
	 */
	void give(UUID actorId, UUID projectId, UUID userId, String role);

	/**
	 * @throws NotAProjectRoleException if {@code role} is not the key of a project role
	 * @throws IllegalStateException if the User holds no project role in this project
	 */
	void change(UUID actorId, UUID projectId, UUID userId, String role);

	/** @throws IllegalStateException if the User holds no project role in this project */
	void remove(UUID actorId, UUID projectId, UUID userId);

	/** The key of the project role the User holds in this project, if any. */
	Optional<String> roleOf(UUID projectId, UUID userId);

	/** The project role key of every User who holds one in this project. */
	Map<UUID, String> rolesIn(UUID projectId);

	/** How many Users hold this project role in this project. */
	long countHolders(UUID projectId, String role);

	/** Every project role, built-in and custom, by name. */
	List<ProjectRoleSummary> projectRoles();

	/** A project role as a Members page offers it. */
	record ProjectRoleSummary(String key, String name) {
	}

}
