package com.nimbus.api.issues;

import java.util.UUID;

/**
 * Published in the transaction that deletes an Issue. {@code issueKey} is like {@code NIM-12}; {@code actorId} deleted
 * it, and {@code title}, {@code reporterId} and {@code assigneeId} (null when unassigned) are the Issue as it was.
 */
public record IssueDeleted(UUID projectId, String issueKey, UUID actorId, String title, UUID reporterId,
		UUID assigneeId) {
}
