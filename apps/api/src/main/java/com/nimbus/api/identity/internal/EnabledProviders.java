package com.nimbus.api.identity.internal;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.stereotype.Component;

/**
 * Which of the sign-in providers the server has switched on: the ones with an OAuth registration, so their
 * {@code /api/auth/oauth2/<provider>} address exists. The one rule behind the providers list the web app reads and
 * the ticket for connecting a provider.
 */
@Component
class EnabledProviders {

	/** The order the buttons appear in. */
	private static final List<String> KNOWN = List.of(GoogleProfiles.PROVIDER, GithubProfiles.PROVIDER);

	private final ObjectProvider<ClientRegistrationRepository> registrations;

	EnabledProviders(ObjectProvider<ClientRegistrationRepository> registrations) {
		this.registrations = registrations;
	}

	List<String> ids() {
		var repository = registrations.getIfAvailable();
		return repository == null ? List.of()
				: KNOWN.stream().filter(provider -> repository.findByRegistrationId(provider) != null).toList();
	}

	boolean isEnabled(String provider) {
		return ids().contains(provider);
	}

}
