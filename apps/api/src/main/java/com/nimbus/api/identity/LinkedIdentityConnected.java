package com.nimbus.api.identity;

import java.time.Instant;
import java.util.UUID;

/**
 * Published when a User connects Google or GitHub from the Security page, in the same transaction as the link.
 * Not for a provider sign-in that creates or links the User, and not when the account was already connected.
 *
 * @param userId the User's id
 * @param provider {@code google} or {@code github}
 * @param accountName the Google email or GitHub username, or null when the provider gave none
 * @param at when it was connected
 */
public record LinkedIdentityConnected(UUID userId, String provider, String accountName, Instant at) {
}
