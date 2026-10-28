package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.nimbus.api.identity.LinkedIdentityDisconnected;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** What the Security page shows of a User's Linked identities. */
@Service
class LinkedIdentities {

	/** The order the "Continue with ..." buttons appear in. */
	private static final List<String> ORDER = List.of(GoogleProfiles.PROVIDER, GithubProfiles.PROVIDER);

	static final Map<String, String> NAMES = Map.of(GoogleProfiles.PROVIDER, "Google",
			GithubProfiles.PROVIDER, "GitHub");

	private final LinkedIdentityRepository identities;

	private final DisconnectedProviders disconnectedProviders;

	private final UserRepository users;

	private final Sessions sessions;

	private final Clock clock;

	private final EnabledProviders enabledProviders;

	private final LinkTickets tickets;

	private final Duration linkRecentSignIn;

	private final TransactionTemplate transaction;

	private final ProfilePictures pictures;

	private final ApplicationEventPublisher events;

	LinkedIdentities(LinkedIdentityRepository identities, DisconnectedProviders disconnectedProviders,
			UserRepository users, Sessions sessions, Clock clock, AuthProperties properties,
			PlatformTransactionManager transactionManager, EnabledProviders enabledProviders,
			LinkTickets tickets, ProfilePictures pictures, ApplicationEventPublisher events) {
		this.events = events;
		this.pictures = pictures;
		this.enabledProviders = enabledProviders;
		this.tickets = tickets;
		this.linkRecentSignIn = properties.linkRecentSignIn();
		this.identities = identities;
		this.disconnectedProviders = disconnectedProviders;
		this.users = users;
		this.sessions = sessions;
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/**
	 * A ticket for starting to connect {@code provider} with a full page load. The Session must have started within
	 * {@code nimbus.auth.link-recent-sign-in}, so a stolen access token alone can't attach someone else's account.
	 *
	 * @throws UnknownProviderException when {@code provider} is unknown or switched off
	 * @throws AlreadyConnectedException when the User has a Linked identity for it already
	 * @throws Sessions.ReauthRequiredException when the Session is older than that
	 * @throws InvalidBearerTokenException when the Session has ended
	 */
	LinkTickets.Issued issueLinkTicket(UUID userId, UUID currentSessionId, String provider) {
		sessions.requireActive(currentSessionId, userId);
		// What would fail anyway comes before asking for a new sign-in that would not help.
		if (!enabledProviders.isEnabled(provider)) {
			throw new UnknownProviderException();
		}
		if (identities.findByUserId(userId).stream().anyMatch(identity -> identity.provider().equals(provider))) {
			throw new AlreadyConnectedException();
		}
		sessions.requireStartedWithin(currentSessionId, userId, linkRecentSignIn);
		return tickets.issue(userId, currentSessionId, provider);
	}

	/**
	 * Removes the provider from the User's way to sign in, and marks it so that a later sign-in on their email
	 * doesn't link it again (only connecting it from the Security page does). Sessions stay. A provider that isn't
	 * linked changes nothing. The check and the delete run under the User's row lock, so two disconnects at once
	 * can't take away the last way to sign in. Publishes {@link LinkedIdentityDisconnected} in the same transaction;
	 * {@code notifications} tells the User.
	 *
	 * @throws UnknownProviderException when {@code provider} is none of the providers Nimbus knows
	 * @throws LastSignInMethodException when this is the only way the User can sign in
	 * @throws org.springframework.security.oauth2.server.resource.InvalidBearerTokenException when the session has ended
	 */
	void disconnect(UUID userId, UUID currentSessionId, String provider) {
		transaction.executeWithoutResult(status -> {
			var user = users.findLockedById(userId).orElseThrow(() -> new InvalidBearerTokenException(
					"The User for this token no longer exists"));
			// Before the provider is looked at, so an ended session is a 401 whatever was asked.
			sessions.requireActive(currentSessionId, userId);
			if (!NAMES.containsKey(provider)) {
				throw new UnknownProviderException();
			}
			var disconnectedAt = clock.instant();
			var linked = identities.findByUserId(userId);
			var removing = linked.stream().filter(identity -> identity.provider().equals(provider)).toList();
			if (removing.isEmpty()) {
				return;
			}
			if (user.passwordHash() == null && linked.size() == removing.size()) {
				throw new LastSignInMethodException();
			}
			// The picture goes with the identity; if it was the one shown, the User shows initials, not another one.
			var shown = pictures.shown(user, linked);
			// The old fallback picture belongs to no option, so it may be this provider's: it goes too.
			if (shown.source() == null && shown.address() != null
					|| shown.source() != null && shown.source().value().equals(provider)) {
				user.choosePictureSource(PictureSource.INITIALS);
				user.clearFallbackAvatar();
			}
			identities.deleteAll(removing);
			disconnectedProviders.mark(userId, provider, disconnectedAt);
			events.publishEvent(new LinkedIdentityDisconnected(userId, provider, disconnectedAt));
		});
	}

	/**
	 * What a browser may see of the User's Linked identities: the check that its session is still running and the
	 * read are one operation, like the sessions list, so a signed-out browser whose access token still works gets
	 * nothing.
	 *
	 * @throws org.springframework.security.oauth2.server.resource.InvalidBearerTokenException when the session has ended
	 */
	@Transactional(readOnly = true)
	List<LinkedIdentityView> listFor(UUID userId, UUID currentSessionId) {
		sessions.requireActive(currentSessionId, userId);
		return listFor(userId);
	}

	/** The User's Linked identities, Google first. Never the provider's own id for the person. */
	@Transactional(readOnly = true)
	List<LinkedIdentityView> listFor(UUID userId) {
		return identities.findByUserId(userId)
			.stream()
			.sorted(Comparator.comparingInt(identity -> position(identity.provider())))
			.map(identity -> new LinkedIdentityView(identity.provider(), identity.accountName(), identity.createdAt()))
			.toList();
	}

	private static int position(String provider) {
		var index = ORDER.indexOf(provider);
		return index < 0 ? ORDER.size() : index;
	}

	static class UnknownProviderException extends RuntimeException {

		UnknownProviderException() {
			super("Nimbus has no such provider");
		}

	}

	static class AlreadyConnectedException extends RuntimeException {

		AlreadyConnectedException() {
			super("This provider is already connected");
		}

	}

	static class LastSignInMethodException extends RuntimeException {

		LastSignInMethodException() {
			super("This is the only way you can sign in. Set a password first.");
		}

	}

	/** @param accountName the Google email or GitHub username, or null when it was linked before names were kept */
	record LinkedIdentityView(String provider, String accountName, Instant connectedAt) {
	}

}
