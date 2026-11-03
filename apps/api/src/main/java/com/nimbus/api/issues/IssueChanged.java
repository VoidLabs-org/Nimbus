package com.nimbus.api.issues;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Published in the transaction that changes an Issue, once per edit that changed something. {@code title},
 * {@code reporterId} and {@code assigneeId} are the Issue as it is after the change ({@code assigneeId} is
 * {@code null} when unassigned); {@code actorId} made the change and {@code at} is when. {@code changes} has one
 * entry per field that really changed, among {@code title}, {@code description}, {@code type}, {@code priority},
 * {@code assignee} and {@code status}.
 */
public record IssueChanged(UUID projectId, String issueKey, UUID actorId, String title, UUID reporterId,
		UUID assigneeId, List<Change> changes, Instant at) {

	/**
	 * One changed field. {@code before} and {@code after} are the values for {@code title}, {@code type},
	 * {@code priority} and {@code status} (its name), and User ids for {@code assignee} ({@code null} for nobody).
	 * A {@code description} change is only a flag: both values are {@code null}, as its text is never carried.
	 */
	public record Change(String field, String before, String after) {
	}
}
