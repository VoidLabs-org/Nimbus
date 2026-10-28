package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * What clients may see of a User. Never serialize the entity itself: it holds the password hash.
 *
 * @param avatarUrl the address of the Profile picture the User shows; null for initials
 * @param hasUploadedPicture whether the User has an uploaded photo, shown or not
 * @param passwordChangedAt when the password was last set; null without one, or when it was set before Nimbus kept it
 * @param pictureSource what the User shows: {@code uploaded}, {@code google}, {@code github} or {@code initials}; null
 * for the picture from before Linked identities kept their own, which belongs to none of them
 * @param pictureOptions what the User may pick from
 */
record UserResponse(UUID id, String email, String displayName, String avatarUrl, boolean hasPassword,
		boolean emailVerified, Instant passwordChangedAt, boolean hasUploadedPicture, String pictureSource,
		PictureOptions pictureOptions) {

	/**
	 * @param uploadedAt when the uploaded photo was added; null without one
	 * @param uploadedUrl the address of the uploaded photo, shown or not (for its thumbnail); null without one
	 * @param providers each connected provider that has a picture, Google first; the label is the account's email
	 * (Google) or name (GitHub)
	 */
	record PictureOptions(Instant uploadedAt, String uploadedUrl, List<ProfilePictures.PictureOption> providers) {
	}

	static UserResponse from(User user, ProfilePictures pictures) {
		var view = pictures.viewOf(user);
		return new UserResponse(user.getId(), user.email(), user.displayName(), view.address(),
				user.passwordHash() != null, user.emailVerified(), user.passwordChangedAt(),
				user.uploadedPictureKey() != null, view.source() == null ? null : view.source().value(),
				new PictureOptions(view.uploadedAt(), view.uploadedUrl(), view.providers()));
	}

}
