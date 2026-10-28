package com.nimbus.api.projects;

import java.util.UUID;

/** Published in the transaction that creates a project and its first Member. */
public record ProjectCreated(UUID projectId, String key, UUID creatingUserId) {
}
