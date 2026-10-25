package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.UUID;

/**
 * What clients may see of a User. Never serialize the entity itself: it holds the password hash.
 *
 * @param avatarUrl the address of the Profile picture the User shows; null for initials
 * @param hasUploadedPicture whether the User has an uploaded photo, shown or not
 * @param passwordChangedAt when the password was last set; null without one, or when it was set before Nimbus kept it
 */
record UserResponse(UUID id, String email, String displayName, String avatarUrl, boolean hasPassword,
		boolean emailVerified, Instant passwordChangedAt, boolean hasUploadedPicture) {

	static UserResponse from(User user, ProfilePictures pictures) {
		return new UserResponse(user.getId(), user.email(), user.displayName(), pictures.addressOf(user),
				user.passwordHash() != null, user.emailVerified(), user.passwordChangedAt(),
				user.uploadedPictureKey() != null);
	}

}
