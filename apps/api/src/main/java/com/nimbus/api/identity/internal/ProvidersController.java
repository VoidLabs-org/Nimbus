package com.nimbus.api.identity.internal;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Tells the web app which "Continue with ..." providers it may offer. It reads the same registrations the OAuth
 * wiring uses, so it cannot list a provider whose {@code /api/auth/oauth2/<provider>} address does not exist.
 */
@RestController
@RequestMapping("/api/auth/providers")
class ProvidersController {

	/** The order the buttons appear in. */
	private static final List<String> KNOWN = List.of(GoogleProfiles.PROVIDER, GithubProfiles.PROVIDER);

	private final ObjectProvider<ClientRegistrationRepository> registrations;

	ProvidersController(ObjectProvider<ClientRegistrationRepository> registrations) {
		this.registrations = registrations;
	}

	@GetMapping
	ProvidersResponse providers() {
		var repository = registrations.getIfAvailable();
		return new ProvidersResponse(repository == null ? List.of() : enabled(repository));
	}

	private static List<String> enabled(ClientRegistrationRepository repository) {
		return KNOWN.stream()
			.filter(provider -> repository.findByRegistrationId(provider) != null)
			.toList();
	}

	record ProvidersResponse(List<String> providers) {
	}

}
