package com.nimbus.api.identity.internal;

import java.util.UUID;

/** What clients may see of a User. Never serialize the entity itself: it holds the password hash. */
record UserResponse(UUID id, String email, String displayName, String avatarUrl) {

	static UserResponse from(User user) {
		return new UserResponse(user.getId(), user.email(), user.displayName(), user.avatarUrl());
	}

}
