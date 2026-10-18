package com.nimbus.api.identity.internal;

import java.time.Clock;

import com.nimbus.api.identity.EmailVerified;
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
	 * @throws EmailUnverifiedException when the provider doesn't vouch for the email and this login isn't linked yet
	 */
	@Transactional
	User signIn(ExternalProfile profile) {
		var linked = identities.findByProviderAndProviderUserId(profile.provider(), profile.providerUserId());
		if (linked.isPresent()) {
			var user = users.findById(linked.get().userId()).orElseThrow();
			linked.get().refreshAccountName(profile.accountName());
			return refreshAvatar(user, profile);
		}
		if (!profile.emailVerified() || profile.email() == null) {
			throw new EmailUnverifiedException();
		}
		var user = users.findByEmail(profile.email()).orElse(null);
		if (user == null) {
			return create(profile);
		}
		if (disconnectedProviders.isMarked(user.getId(), profile.provider())) {
			throw new ProviderDisconnectedException();
		}
		return link(user, profile);
	}

	private User create(ExternalProfile profile) {
		var user = users.saveAndFlush(User.fromProvider(profile.email(), displayNameOf(profile), profile.avatarUrl(),
				clock.instant()));
		identities.saveAndFlush(new LinkedIdentity(user.getId(), profile.provider(), profile.providerUserId(),
				profile.accountName(), clock.instant()));
		events.publishEvent(new UserRegistered(user.getId(), user.email(), user.displayName()));
		return user;
	}

	private User link(User user, ExternalProfile profile) {
		identities.saveAndFlush(new LinkedIdentity(user.getId(), profile.provider(), profile.providerUserId(),
				profile.accountName(), clock.instant()));
		refreshAvatar(user, profile);
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

	private User refreshAvatar(User user, ExternalProfile profile) {
		if (profile.avatarUrl() != null) {
			user.changeAvatar(profile.avatarUrl());
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
