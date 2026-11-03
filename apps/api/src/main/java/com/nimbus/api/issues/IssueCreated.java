package com.nimbus.api.issues;

import java.util.UUID;

/**
 * Published in the transaction that creates an Issue. {@code issueKey} is like {@code NIM-12}, the Project key in
 * uppercase. {@code actorId} is who created it, and is also {@code reporterId}; {@code assigneeId} is {@code null}
 * when the Issue starts unassigned. {@code title} is the title at creation.
 */
public record IssueCreated(UUID projectId, String issueKey, UUID actorId, String title, UUID reporterId,
		UUID assigneeId) {
}
