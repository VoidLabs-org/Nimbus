package com.nimbus.api.identity.internal;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import com.nimbus.api.storage.ObjectStore;
import com.nimbus.api.storage.StoredObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Uploaded Profile pictures: storing them in the bucket, the address each is served at, and what a User shows. See
 * ADR 0006.
 */
@Service
class ProfilePictures {

	/** The largest file accepted, before it is cropped and re-encoded. */
	static final long MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

	private static final Logger log = LoggerFactory.getLogger(ProfilePictures.class);

	/** Keys are 16 random bytes, URL-safe base64 without padding. Anything else can't be one. */
	private static final Pattern KEY = Pattern.compile("[A-Za-z0-9_-]{22}");

	/** Where the photos sit in the bucket, so other kinds of files can share it. */
	private static final String FOLDER = "profile-pictures/";

	private final SecureRandom random = new SecureRandom();

	private final ObjectStore store;

	private final UserRepository users;

	private final TransactionTemplate transaction;

	private final Clock clock;

	private final String baseUrl;

	ProfilePictures(ObjectStore store, UserRepository users, PlatformTransactionManager transactionManager, Clock clock,
			ProfilePictureProperties properties) {
		this.store = store;
		this.users = users;
		this.transaction = new TransactionTemplate(transactionManager);
		this.clock = clock;
		this.baseUrl = properties.baseUrl();
	}

	/**
	 * Makes the file the User's uploaded photo and shows it. The photo is stored under a fresh key before the User
	 * is saved, so the User never points at a missing object; if saving fails, the new object is deleted (best
	 * effort). The photo it replaces is deleted after the save; a failure there is only logged.
	 *
	 * @throws FileTooLargeException over {@link #MAX_UPLOAD_BYTES}
	 * @throws PictureImages.UnsupportedTypeException when it isn't a JPEG, PNG or WebP
	 * @throws PictureImages.UnreadableImageException when it can't be decoded
	 */
	User upload(UUID userId, byte[] file) {
		if (file.length > MAX_UPLOAD_BYTES) {
			throw new FileTooLargeException();
		}
		var picture = PictureImages.toProfilePicture(file);
		var key = newKey();
		store.store(FOLDER + key, picture, PictureImages.CONTENT_TYPE);
		Saved saved;
		try {
			saved = transaction.execute(status -> {
				var user = users.findLockedById(userId).orElseThrow();
				var replaced = user.useUploadedPicture(key, clock.instant());
				return new Saved(user, replaced);
			});
		}
		catch (RuntimeException e) {
			deleteQuietly(key);
			throw e;
		}
		if (saved.replaced() != null) {
			deleteQuietly(saved.replaced());
		}
		return saved.user();
	}

	/** The uploaded photo with this key; empty for anything that isn't one. Close it once sent. */
	Optional<StoredObject> read(String key) {
		if (!KEY.matcher(key).matches()) {
			return Optional.empty();
		}
		return store.read(FOLDER + key);
	}

	/**
	 * The address of the picture the User shows: their uploaded photo once they chose it, otherwise the picture their
	 * last provider sign-in brought, as before Users could choose. Null for initials.
	 */
	String addressOf(User user) {
		if (user.pictureSource() == PictureSource.UPLOADED && user.uploadedPictureKey() != null) {
			return baseUrl + "/" + user.uploadedPictureKey();
		}
		return user.avatarUrl();
	}

	private String newKey() {
		var bytes = new byte[16];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private void deleteQuietly(String key) {
		try {
			store.delete(FOLDER + key);
		}
		catch (RuntimeException e) {
			log.warn("Could not delete the Profile picture {} from the bucket; it stays there unused", key, e);
		}
	}

	private record Saved(User user, String replaced) {
	}

	/** The file is over {@link #MAX_UPLOAD_BYTES}. */
	static class FileTooLargeException extends RuntimeException {

		FileTooLargeException() {
			super("Upload a picture of at most 5 MB");
		}

	}

}
