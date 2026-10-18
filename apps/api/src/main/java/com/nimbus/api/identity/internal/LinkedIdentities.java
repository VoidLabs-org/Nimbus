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

	LinkedIdentities(LinkedIdentityRepository identities) {
		this.identities = identities;
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
