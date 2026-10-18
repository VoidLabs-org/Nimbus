package com.nimbus.api.projects;

import java.util.UUID;

/** A project's stable identity and current state, for other modules. */
public record ProjectSummary(UUID id, String key, String name, boolean archived) {
}
