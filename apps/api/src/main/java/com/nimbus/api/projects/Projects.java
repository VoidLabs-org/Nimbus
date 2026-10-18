package com.nimbus.api.projects;

import java.util.Optional;
import java.util.UUID;

/**
 * Project lookups for other modules. These do not authorize the caller: the owning module must check
 * membership/permissions before exposing a result, and the archived flag before writing to a project.
 */
public interface Projects {

	Optional<ProjectSummary> findById(UUID id);

	/** Project keys are matched without regard to case. */
	Optional<ProjectSummary> findByKey(String key);

	boolean isMember(UUID projectId, UUID userId);
}
