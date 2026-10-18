package com.nimbus.api.identity.internal;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** What the Security page shows of a User's Linked identities. */
@Service
class LinkedIdentities {

	/** The order the "Continue with ..." buttons appear in. */
	private static final List<String> ORDER = List.of(GoogleProfiles.PROVIDER, GithubProfiles.PROVIDER);

	private final LinkedIdentityRepository identities;

	private final Sessions sessions;

	LinkedIdentities(LinkedIdentityRepository identities, Sessions sessions) {
		this.identities = identities;
		this.sessions = sessions;
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

	/** @param accountName the Google email or GitHub username, or null when it was linked before names were kept */
	record LinkedIdentityView(String provider, String accountName, Instant connectedAt) {
	}

}
