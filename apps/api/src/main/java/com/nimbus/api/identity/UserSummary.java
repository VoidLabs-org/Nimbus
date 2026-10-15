package com.nimbus.api.identity;

import java.util.UUID;

/**
 * What other modules may know about a User.
 *
 * @param avatarUrl {@code null} when the User has no picture
 * @param emailVerified whether the User has proved they own the email (through Google or GitHub, or as the seeded
 * admin); a password sign-up has not
 */
public record UserSummary(UUID id, String email, String displayName, String avatarUrl, boolean emailVerified) {
}
