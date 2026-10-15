package com.nimbus.api.identity;

import java.util.UUID;

/**
 * Published when an existing User's email becomes verified: someone signed in with Google or GitHub on the email
 * of a User who had only registered it with a password, so the provider proved who owns it. Not published for
 * Users created already verified (they are announced with {@link UserRegistered}).
 *
 * @param userId the User's id
 * @param email the User's lower-cased email
 */
public record EmailVerified(UUID userId, String email) {
}
