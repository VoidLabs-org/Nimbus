package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User's email changes, in the same transaction as the change. Carries no code and not the old
 * email.
 *
 * @param userId the User's id
 * @param newEmail the User's new, lower-cased email
 * @param occurredAt when it changed
 */
public record EmailChanged(UUID userId, String newEmail, Instant occurredAt) {
}
