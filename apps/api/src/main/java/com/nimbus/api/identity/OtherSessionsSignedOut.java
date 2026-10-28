package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User uses "Sign out all other devices", in the same transaction that ends those Sessions, also
 * when there were none to end.
 *
 * @param userId the User's id
 * @param at when it was used
 */
public record OtherSessionsSignedOut(UUID userId, Instant at) {
}
