package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

/**
 * What clients may see of a User. Never serialize the entity itself: it holds the password hash.
 *
 * @param passwordChangedAt when the password was last set; null without one, or when it was set before Nimbus kept it
 */
record UserResponse(UUID id, String email, String displayName, String avatarUrl, boolean hasPassword,
		boolean emailVerified, Instant passwordChangedAt) {

	static UserResponse from(User user) {
		return new UserResponse(user.getId(), user.email(), user.displayName(), user.avatarUrl(),
				user.passwordHash() != null, user.emailVerified(), user.passwordChangedAt());
	}

}
