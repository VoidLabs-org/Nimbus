package com.nimbus.api.identity;

import java.util.UUID;

/**
 * Published when a User is created: by registration, or by the admin seed at startup. Not published on
 * sign-in. Other modules react to it, e.g. to give a new User their default access.
 *
 * @param userId the new User's id
 * @param email the User's lower-cased email
 * @param displayName the User's display name
 */
public record UserRegistered(UUID userId, String email, String displayName) {
}
