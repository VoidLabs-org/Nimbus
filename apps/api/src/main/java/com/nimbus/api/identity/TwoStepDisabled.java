package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User turns off Two-step verification; their key and Recovery codes are gone. Carries no code.
 *
 * @param userId the User's id
 * @param occurredAt when it was turned off
 */
public record TwoStepDisabled(UUID userId, Instant occurredAt) {
}
