package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User makes a new set of Recovery codes; the old set stopped working. Carries no code.
 *
 * @param userId the User's id
 * @param occurredAt when the new set was made
 */
public record RecoveryCodesRegenerated(UUID userId, Instant occurredAt) {
}
