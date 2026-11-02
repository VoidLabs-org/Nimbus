package com.nimbus.api.issues;

import java.util.UUID;

/** Published in the transaction that deletes an Issue. {@code issueKey} is like {@code NIM-12}. */
public record IssueDeleted(UUID projectId, String issueKey) {
}
