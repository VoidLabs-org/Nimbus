package com.nimbus.api.issues;

import java.util.UUID;

/** Published in the transaction that creates an Issue. {@code issueKey} is like {@code NIM-12}, the Project key in uppercase. */
public record IssueCreated(UUID projectId, String issueKey) {
}
