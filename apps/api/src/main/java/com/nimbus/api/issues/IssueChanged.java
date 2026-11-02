package com.nimbus.api.issues;

import java.util.List;
import java.util.UUID;

/**
 * Published in the transaction that changes an Issue, once per edit that changed something. {@code changedFields}
 * are among {@code title}, {@code description}, {@code type}, {@code priority}, {@code assignee} and {@code status}.
 */
public record IssueChanged(UUID projectId, String issueKey, List<String> changedFields) {
}
