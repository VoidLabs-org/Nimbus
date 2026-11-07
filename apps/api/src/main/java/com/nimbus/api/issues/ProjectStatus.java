package com.nimbus.api.issues;

import java.util.UUID;

/**
 * One of a project's Statuses. {@code category} is {@code TODO}, {@code IN_PROGRESS} or {@code DONE}. Exactly one of
 * a project's To do Statuses is {@code isDefault}: the one new Issues start in.
 */
public record ProjectStatus(UUID id, String name, String category, int position, boolean isDefault) {
}
