package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User signs in with one of their Recovery codes, which is then used up. Carries no code.
 *
 * @param userId the User's id
 * @param occurredAt when the code was used
 * @param codesLeft the User's Recovery codes not used yet
 */
public record RecoveryCodeUsed(UUID userId, Instant occurredAt, int codesLeft) {
}
