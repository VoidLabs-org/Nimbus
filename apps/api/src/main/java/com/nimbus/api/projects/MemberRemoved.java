package com.nimbus.api.projects;

import java.util.UUID;

/**
 * Published in the transaction that removes a Member from a project, so other modules can react (the issues module
 * unassigns the User's Issues in that project). Consumers should handle it after commit.
 */
public record MemberRemoved(UUID projectId, UUID userId) {
}
