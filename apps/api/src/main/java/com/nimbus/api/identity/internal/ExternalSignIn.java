package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

import com.nimbus.api.identity.EmailVerified;
import com.nimbus.api.identity.LinkedIdentityConnected;
import com.nimbus.api.identity.UserRegistered;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decides which User a provider's profile signs in as, the same way for every provider. A race that creates
 * the same User or link twice ends in a unique-constraint violation, which the caller treats as a failed
 * sign-in.
 */
@Service
class ExternalSignIn {

	private final UserRepository users;

	private final LinkedIdentityRepository identities;

	private final DisconnectedProviders disconnectedProviders;

	private final Sessions sessions;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	ExternalSignIn(UserRepository users, LinkedIdentityRepository identities,
			DisconnectedProviders disconnectedProviders, Sessions sessions, Clock clock,
			ApplicationEventPublisher events) {
		this.users = users;
		this.identities = identities;
		this.disconnectedProviders = disconnectedProviders;
		this.sessions = sessions;
		this.clock = clock;
		this.events = events;
	}

	/**
	 * The existing User {@link #signIn} would sign the profile in as, found by the same rules but changing nothing:
	 * no link, no avatar, no new User. Lets a sign-in that needs Two-step verification wait for the code before
	 * anything is stored.
	 *
	 * @return empty when signing in would create a new User
	 * @throws EmailUnverifiedException as {@link #signIn} does
	 * @throws ProviderDisconnectedException as {@link #signIn} does
	 */
	@Transactional(readOnly = true)
	Optional<User> whoSignsIn(ExternalProfile profile) {
		var linked = identities.findByProviderAndProviderUserId(profile.provider(), profile.providerUserId());
		if (linked.isPresent()) {
			return users.findById(linked.get().userId());
		}
		if (!profile.emailVerified() || profile.email() == null) {
			throw new EmailUnverifiedException();
		}
		var user = users.findByEmail(profile.email());
		if (user.isPresent() && disconnectedProviders.isMarked(user.get().getId(), profile.provider())) {
			throw new ProviderDisconnectedException();
		}
		return user;
	}

	/**
	 * @throws EmailUnverifiedException when the provider doesn't vouch for the email and this login isn't linked yet
	 * @throws ProviderDisconnectedException when the User on this email disconnected this provider
	 */
	@Transactional
	User signIn(ExternalProfile profile) {
		return resolve(profile).user();
	}

	/** Resolves the profile and starts its Session atomically, suppressing only a new User's first alert. */
	@Transactional
	Sessions.IssuedToken startSession(ExternalProfile profile, String userAgent) {
		var result = resolve(profile);
		return sessions.start(result.user(), userAgent, !result.created());
	}

	private record Resolved(User user, boolean created) {
	}

	private Resolved resolve(ExternalProfile profile) {
		var linked = identities.findByProviderAndProviderUserId(profile.provider(), profile.providerUserId());
		if (linked.isPresent()) {
			var user = users.findById(linked.get().userId()).orElseThrow();
			linked.get().refreshAccountName(profile.accountName());
			return new Resolved(refreshPicture(user, linked.get(), profile, true), false);
		}
		if (!profile.emailVerified() || profile.email() == null) {
			throw new EmailUnverifiedException();
		}
		var user = users.findByEmail(profile.email()).orElse(null);
		if (user == null) {
			return new Resolved(create(profile), true);
		}
		// Under the row lock a disconnect takes, so one that overlaps this sign-in is either seen here or waits.
		users.findLockedById(user.getId()).orElseThrow();
		if (disconnectedProviders.isMarked(user.getId(), profile.provider())) {
			throw new ProviderDisconnectedException();
		}
		return new Resolved(link(user, profile), false);
	}

	/**
	 * Links the provider account to a User who asked for it from the Security page. Nothing about the User changes
	 * (email, verification, password, sessions); the provider's disconnected mark is cleared. The provider's email may
	 * differ from the User's but must still be verified.
	 *
	 * @return whether the account was newly linked; false when it was already this User's (its name is refreshed)
	 * @throws EmailUnverifiedException when the provider doesn't vouch for its email
	 * @throws AlreadyLinkedException when the account belongs to another User
	 * @throws ProviderAlreadyConnectedException when the User has another account of this provider
	 * @throws ConnectExpiredException when the Session that asked for the connect has ended
	 */
	@Transactional
	boolean connect(UUID userId, UUID sessionId, ExternalProfile profile) {
		if (!profile.emailVerified() || profile.email() == null) {
			throw new EmailUnverifiedException();
		}
		var user = users.findLockedById(userId).orElseThrow();
		// Under the lock, so a "sign out everywhere" either comes first (and this fails) or waits for the link.
		if (!sessions.isActive(sessionId, userId)) {
			throw new ConnectExpiredException();
		}
		var existing = identities.findByProviderAndProviderUserId(profile.provider(), profile.providerUserId());
		if (existing.isPresent()) {
			if (!existing.get().userId().equals(userId)) {
				throw new AlreadyLinkedException();
			}
			existing.get().refreshAccountName(profile.accountName());
			refreshPicture(user, existing.get(), profile, true);
			return false;
		}
		if (identities.findByUserId(userId).stream().anyMatch(identity -> identity.provider().equals(profile.provider()))) {
			throw new ProviderAlreadyConnectedException();
		}
		var identity = identities.saveAndFlush(new LinkedIdentity(userId, profile.provider(), profile.providerUserId(),
				profile.accountName(), profile.avatarUrl(), clock.instant()));
		refreshPicture(user, identity, profile, false);
		disconnectedProviders.clear(userId, profile.provider());
		events.publishEvent(new LinkedIdentityConnected(userId, profile.provider(), profile.accountName(), identity.createdAt()));
		return true;
	}

	private User create(ExternalProfile profile) {
		var user = users.saveAndFlush(User.fromProvider(profile.email(), displayNameOf(profile), clock.instant()));
		identities.saveAndFlush(new LinkedIdentity(user.getId(), profile.provider(), profile.providerUserId(),
				profile.accountName(), profile.avatarUrl(), clock.instant()));
		events.publishEvent(new UserRegistered(user.getId(), user.email(), user.displayName()));
		return user;
	}

	private User link(User user, ExternalProfile profile) {
		var identity = identities.saveAndFlush(new LinkedIdentity(user.getId(), profile.provider(),
				profile.providerUserId(), profile.accountName(), profile.avatarUrl(), clock.instant()));
		refreshPicture(user, identity, profile, false);
		if (!user.emailVerified()) {
			// Someone registered this email with a password but never proved they own it. The person the
			// provider just vouched for is the real owner, so whatever the first registrant knows stops working.
			user.removePassword();
			sessions.endAll(user);
			user.verifyEmail();
			events.publishEvent(new EmailVerified(user.getId(), user.email()));
		}
		return user;
	}

	/** Only this identity's own picture follows the provider; what the User chose to show is never touched. */
	private User refreshPicture(User user, LinkedIdentity identity, ExternalProfile profile, boolean alreadyLinked) {
		if (profile.avatarUrl() != null) {
			identity.refreshPicture(profile.avatarUrl());
			// The old fallback picture came from an identity the User already had; a new one doesn't replace it.
			if (alreadyLinked) {
				user.clearFallbackAvatar();
			}
		}
		return user;
	}

	/**
	 * A provider may send no name, or one that registration would reject. The sign-in can't be refused over it,
	 * so the name is made valid ({@link DisplayName#clean}), or is the start of the email when nothing usable is
	 * left. The email's start is cleaned the same way, and a last fallback keeps the name from ever being empty.
	 */
	private static String displayNameOf(ExternalProfile profile) {
		var name = DisplayName.clean(profile.name());
		if (name.isEmpty()) {
			name = DisplayName.clean(profile.email().substring(0, profile.email().indexOf('@')));
		}
		return name.isEmpty() ? "User" : name;
	}

	/** The provider account belongs to another User. */
	static class AlreadyLinkedException extends RuntimeException {

		AlreadyLinkedException() {
			super("This provider account is already connected to another User");
		}

	}

	/** The User already has an account of this provider connected. */
	static class ProviderAlreadyConnectedException extends RuntimeException {

		ProviderAlreadyConnectedException() {
			super("The User has an account of this provider already");
		}

	}

	/** The Session that asked for the connect has ended. */
	static class ConnectExpiredException extends RuntimeException {

		ConnectExpiredException() {
			super("The Session that asked for this has ended");
		}

	}

	/** The User on this email disconnected this provider, so it can't sign in as them until they connect it again. */
	static class ProviderDisconnectedException extends RuntimeException {

		ProviderDisconnectedException() {
			super("The User disconnected this provider");
		}

	}

	/** The provider didn't confirm the person owns the email, so it can't be used to find or create a User. */
	static class EmailUnverifiedException extends RuntimeException {

		EmailUnverifiedException() {
			super("The provider did not verify this email");
		}

	}

}
