package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User disconnects Google or GitHub from the Security page, in the same transaction as the
 * removal. Not when the provider wasn't connected.
 *
 * @param userId the User's id
 * @param provider {@code google} or {@code github}
 * @param at when it was disconnected
 */
public record LinkedIdentityDisconnected(UUID userId, String provider, Instant at) {
}
