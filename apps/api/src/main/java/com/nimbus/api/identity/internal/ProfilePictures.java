package com.nimbus.api.identity.internal;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;

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

	/** Uploads one User may make in {@link #UPLOAD_WINDOW}; only uploads that failed in the bucket or database give theirs back. */
	static final int UPLOADS_PER_WINDOW = 10;

	static final Duration UPLOAD_WINDOW = Duration.ofHours(1);

	private static final String LIMIT_MESSAGE = "You've uploaded " + UPLOADS_PER_WINDOW
			+ " photos this hour. Try again later.";

	private static final List<String> PROVIDER_ORDER = List.of(GoogleProfiles.PROVIDER, GithubProfiles.PROVIDER);

	private static final Logger log = LoggerFactory.getLogger(ProfilePictures.class);

	/** Keys are 16 random bytes, URL-safe base64 without padding. Anything else can't be one. */
	private static final Pattern KEY = Pattern.compile("[A-Za-z0-9_-]{22}");

	/** Where the photos sit in the bucket, so other kinds of files can share it. */
	private static final String FOLDER = "profile-pictures/";

	private final SecureRandom random = new SecureRandom();

	private final ObjectStore store;

	private final UserRepository users;

	private final LinkedIdentityRepository identities;

	private final TransactionTemplate transaction;

	private final Clock clock;

	private final String baseUrl;

	private final SlidingWindowLimiter uploadsByUser;

	ProfilePictures(ObjectStore store, UserRepository users, LinkedIdentityRepository identities,
			PlatformTransactionManager transactionManager, Clock clock, ProfilePictureProperties properties) {
		this.store = store;
		this.users = users;
		this.identities = identities;
		this.transaction = new TransactionTemplate(transactionManager);
		this.clock = clock;
		this.baseUrl = properties.baseUrl();
		this.uploadsByUser = new SlidingWindowLimiter(UPLOADS_PER_WINDOW, UPLOAD_WINDOW, clock);
	}

	/** Refuses early, without counting, when the User used up their uploads. */
	void requireUnderLimit(UUID userId) {
		uploadsByUser.requireUnder(userId.toString(), LIMIT_MESSAGE);
	}

	/**
	 * Makes the file the User's uploaded photo and shows it. The photo is stored under a fresh key before the User
	 * is saved, so the User never points at a missing object; if saving fails, the new object is deleted (best
	 * effort). The photo it replaces is deleted after the save; a failure there is only logged.
	 *
	 * @throws SlidingWindowLimiter.LimitExceededException after {@value #UPLOADS_PER_WINDOW} uploads in the last hour
	 * @throws FileTooLargeException over {@link #MAX_UPLOAD_BYTES}
	 * @throws PictureImages.UnsupportedTypeException when it isn't a JPEG, PNG or WebP
	 * @throws PictureImages.UnreadableImageException when it can't be decoded
	 */
	User upload(UUID userId, byte[] file) {
		if (file.length > MAX_UPLOAD_BYTES) {
			throw new FileTooLargeException();
		}
		var counted = uploadsByUser.acquire(userId.toString(), LIMIT_MESSAGE);
		// A file that can't be used still cost the decoding, so it stays counted.
		var picture = PictureImages.toProfilePicture(file);
		var key = newKey();
		Saved saved;
		try {
			store.store(FOLDER + key, picture, PictureImages.CONTENT_TYPE);
			saved = transaction.execute(status -> {
				var user = users.findLockedById(userId).orElseThrow();
				var replaced = user.useUploadedPicture(key, clock.instant());
				return new Saved(user, replaced);
			});
		}
		catch (RuntimeException e) {
			// The bucket or the database failed, not the User's file: it doesn't use up their uploads, and the
			// object may exist even when the store call timed out.
			uploadsByUser.release(userId.toString(), counted);
			deleteQuietly(key);
			throw e;
		}
		if (saved.replaced() != null) {
			deleteQuietly(saved.replaced());
		}
		return saved.user();
	}

	/**
	 * Removes the User's uploaded photo and deletes it from the bucket (a failure there is only logged). If it was
	 * shown, the User shows initials. Nothing changes without an upload.
	 */
	void remove(UUID userId) {
		var removed = transaction.execute(status -> users.findLockedById(userId).orElseThrow().removeUploadedPicture());
		if (removed != null) {
			deleteQuietly(removed);
		}
	}

	/** The uploaded photo with this key; empty for anything that isn't one. Close it once sent. */
	Optional<StoredObject> read(String key) {
		if (!KEY.matcher(key).matches()) {
			return Optional.empty();
		}
		return store.read(FOLDER + key);
	}

	/**
	 * Makes {@code source} what the User shows. The pick is checked against what the User has now, under their row
	 * lock.
	 *
	 * @throws SourceUnavailableException for an upload they don't have, a provider that isn't connected or sent no
	 * picture, or a word that is none of the options
	 */
	User choose(UUID userId, String source) {
		var wanted = PictureSource.parse(source).orElseThrow(SourceUnavailableException::new);
		return transaction.execute(status -> {
			var user = users.findLockedById(userId).orElseThrow();
			var available = switch (wanted) {
				case INITIALS -> true;
				case UPLOADED -> user.uploadedPictureKey() != null;
				case GOOGLE, GITHUB -> identities.findByUserId(userId)
					.stream()
					.anyMatch(identity -> identity.provider().equals(wanted.value()) && identity.pictureUrl() != null);
			};
			if (!available) {
				throw new SourceUnavailableException();
			}
			user.choosePictureSource(wanted);
			return user;
		});
	}

	/** What the User shows, and the options they may pick from. Reads their Linked identities. */
	PictureView viewOf(User user) {
		var linked = identities.findByUserId(user.getId());
		var shown = shown(user, linked);
		var providers = withPictures(linked)
			.sorted(Comparator.comparingInt(identity -> PROVIDER_ORDER.indexOf(identity.provider())))
			.map(identity -> new PictureOption(identity.provider(), identity.pictureUrl(),
					identity.accountName() != null ? identity.accountName()
							: LinkedIdentities.NAMES.getOrDefault(identity.provider(), identity.provider())))
			.toList();
		return new PictureView(shown.source(), shown.address(), user.uploadedPictureAt(), uploadedAddress(user),
				providers);
	}

	/** The addresses of the pictures these Users show, with one read for all their Linked identities. */
	Map<UUID, String> addressesOf(Collection<User> users) {
		var byUser = new HashMap<UUID, List<LinkedIdentity>>();
		if (!users.isEmpty()) {
			identities.findByUserIdIn(users.stream().map(User::getId).toList())
				.forEach(identity -> byUser.computeIfAbsent(identity.userId(), id -> new ArrayList<>()).add(identity));
		}
		var addresses = new HashMap<UUID, String>();
		users.forEach(user -> addresses.put(user.getId(),
				shown(user, byUser.getOrDefault(user.getId(), List.of())).address()));
		return addresses;
	}

	/** The address of the picture the User shows; null for initials. */
	String addressOf(User user) {
		return shown(user, identities.findByUserId(user.getId())).address();
	}

	/**
	 * Which option the User shows and where its picture is. Their choice decides; never having chosen means the
	 * earliest-linked identity that has a picture, then the old {@code avatar_url} fallback, then initials.
	 */
	Shown shown(User user, List<LinkedIdentity> linked) {
		var source = user.pictureSource();
		if (source == null) {
			// Only Users from before identities kept pictures have one. It stays until a sign-in with an identity they
			// already had gives that identity its own, so connecting another provider doesn't swap their picture.
			if (user.avatarUrl() != null) {
				return new Shown(null, user.avatarUrl());
			}
			var earliest = withPictures(linked).findFirst();
			if (earliest.isPresent()) {
				var identity = earliest.get();
				return new Shown(PictureSource.ofProvider(identity.provider()).orElse(null), identity.pictureUrl());
			}
			return new Shown(PictureSource.INITIALS, null);
		}
		return switch (source) {
			case INITIALS -> new Shown(source, null);
			case UPLOADED -> user.uploadedPictureKey() == null ? new Shown(PictureSource.INITIALS, null)
					: new Shown(source, uploadedAddress(user));
			case GOOGLE, GITHUB -> withPictures(linked).filter(identity -> identity.provider().equals(source.value()))
				.findFirst()
				.map(identity -> new Shown(source, identity.pictureUrl()))
				.orElse(new Shown(PictureSource.INITIALS, null));
		};
	}

	/** The address the uploaded photo is served at; null without one. */
	private String uploadedAddress(User user) {
		return user.uploadedPictureKey() == null ? null : baseUrl + "/" + user.uploadedPictureKey();
	}

	/** The identities that have a picture, earliest-linked first. */
	private static Stream<LinkedIdentity> withPictures(List<LinkedIdentity> linked) {
		return linked.stream()
			.filter(identity -> identity.pictureUrl() != null)
			.sorted(Comparator.comparing(LinkedIdentity::createdAt));
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

	/** @param source the option shown; null for the old fallback picture, which belongs to no option */
	record Shown(PictureSource source, String address) {
	}

	/** A connected provider the User may show the picture of. */
	record PictureOption(String provider, String pictureUrl, String label) {
	}

	/**
	 * @param source the option shown; null for the old fallback picture
	 * @param address the address of the picture shown; null for initials
	 * @param uploadedAt when the uploaded photo was added; null without one
	 * @param uploadedUrl the address of the uploaded photo, shown or not; null without one
	 * @param providers the connected providers that have a picture, Google first
	 */
	record PictureView(PictureSource source, String address, Instant uploadedAt, String uploadedUrl,
			List<PictureOption> providers) {
	}

	/** The pick isn't one the User can make now. */
	static class SourceUnavailableException extends RuntimeException {

		SourceUnavailableException() {
			super("That picture isn't available");
		}

	}

	/** The file is over {@link #MAX_UPLOAD_BYTES}. */
	static class FileTooLargeException extends RuntimeException {

		FileTooLargeException() {
			super("Upload a picture of at most 5 MB");
		}

	}

}
