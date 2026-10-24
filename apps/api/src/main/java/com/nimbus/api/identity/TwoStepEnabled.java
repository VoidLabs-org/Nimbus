package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User turns on Two-step verification. Carries no key or code.
 *
 * @param userId the User's id
 * @param occurredAt when it was turned on
 */
public record TwoStepEnabled(UUID userId, Instant occurredAt) {
}
