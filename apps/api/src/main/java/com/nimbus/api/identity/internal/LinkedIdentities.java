package com.nimbus.api.identity.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.nimbus.api.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

	private static final Logger log = LoggerFactory.getLogger(LinkedIdentities.class);

	private static final Map<String, String> NAMES = Map.of(GoogleProfiles.PROVIDER, "Google",
			GithubProfiles.PROVIDER, "GitHub");

	private final LinkedIdentityRepository identities;

	private final DisconnectedProviders disconnectedProviders;

	private final UserRepository users;

	private final Sessions sessions;

	private final Mailer mailer;

	private final Clock clock;

	private final String securityUrl;

	private final TransactionTemplate transaction;

	LinkedIdentities(LinkedIdentityRepository identities, DisconnectedProviders disconnectedProviders,
			UserRepository users, Sessions sessions, Mailer mailer, Clock clock, AuthProperties properties,
			PlatformTransactionManager transactionManager) {
		this.identities = identities;
		this.disconnectedProviders = disconnectedProviders;
		this.users = users;
		this.sessions = sessions;
		this.mailer = mailer;
		this.clock = clock;
		this.securityUrl = properties.publicUrl() + "/settings/security";
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/**
	 * Removes the provider from the User's way to sign in, and marks it so that a later sign-in on their email
	 * doesn't link it again (only connecting it from the Security page does). Sessions stay. A provider that isn't
	 * linked changes nothing. The check and the delete run under the User's row lock, so two disconnects at once
	 * can't take away the last way to sign in. The User is told by email after the commit; a failed send is only logged.
	 *
	 * @throws UnknownProviderException when {@code provider} is none of the providers Nimbus knows
	 * @throws LastSignInMethodException when this is the only way the User can sign in
	 * @throws org.springframework.security.oauth2.server.resource.InvalidBearerTokenException when the session has ended
	 */
	void disconnect(UUID userId, UUID currentSessionId, String provider) {
		if (!NAMES.containsKey(provider)) {
			throw new UnknownProviderException();
		}
		var disconnectedAt = clock.instant();
		var email = transaction.execute(status -> {
			var user = users.findLockedById(userId).orElseThrow(() -> new InvalidBearerTokenException(
					"The User for this token no longer exists"));
			sessions.requireActive(currentSessionId, userId);
			var linked = identities.findByUserId(userId);
			var removing = linked.stream().filter(identity -> identity.provider().equals(provider)).toList();
			if (removing.isEmpty()) {
				return null;
			}
			if (user.passwordHash() == null && linked.size() == removing.size()) {
				throw new LastSignInMethodException();
			}
			identities.deleteAll(removing);
			disconnectedProviders.mark(userId, provider, disconnectedAt);
			return user.email();
		});
		if (email == null) {
			return;
		}
		try {
			mailer.send(DisconnectMail.to(email, NAMES.get(provider), disconnectedAt, securityUrl));
		}
		catch (RuntimeException e) {
			// Fire and forget, as the mail module promises: the disconnect has happened and stays.
			log.warn("Could not tell user {} that {} was disconnected", userId, provider, e);
		}
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

	static class LastSignInMethodException extends RuntimeException {

		LastSignInMethodException() {
			super("This is the only way you can sign in. Set a password first.");
		}

	}

	/** @param accountName the Google email or GitHub username, or null when it was linked before names were kept */
	record LinkedIdentityView(String provider, String accountName, Instant connectedAt) {
	}

}
