package com.nimbus.api.issues;

import java.util.List;
import java.util.UUID;

/**
 * What other modules may ask of {@code issues}. Moving an Issue goes through this one operation, whoever asks (the
 * Issue page today, the board later), so transition rules can be added in one place.
 */
public interface Issues {

	/**
	 * Moves the Issue to any Status of its project, recording history and publishing {@link IssueChanged}. The actor
	 * must be a Member of the project. A Status of another project, an Archived project or a non-Member are refused
	 * with the same exceptions the REST endpoint turns into {@code 400}, {@code 409} and {@code 404}.
	 */
	ProjectStatus changeStatus(UUID actor, String issueKey, UUID statusId);

	/** The project's Statuses in order. The actor must be a Member; a non-Member gets the same "not found" as elsewhere. */
	List<ProjectStatus> statuses(UUID actor, UUID projectId);
}
