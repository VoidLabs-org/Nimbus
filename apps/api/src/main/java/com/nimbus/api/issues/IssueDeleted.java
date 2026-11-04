package com.nimbus.api.issues;

import java.time.Instant;
import java.util.UUID;

/**
 * Published in the transaction that deletes an Issue. {@code issueKey} is like {@code NIM-12} and {@code projectKey}
 * and {@code projectName} are its project's; {@code actorId} deleted it at {@code at}, and {@code title},
 * {@code reporterId} and {@code assigneeId} (null when unassigned) are the Issue as it was.
 */
public record IssueDeleted(UUID projectId, String projectKey, String projectName, String issueKey, UUID actorId,
		String title, UUID reporterId, UUID assigneeId, Instant at) {
}
