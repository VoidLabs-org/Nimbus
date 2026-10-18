package com.nimbus.api.identity.internal;

import java.util.List;

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

	private final EnabledProviders enabled;

	ProvidersController(EnabledProviders enabled) {
		this.enabled = enabled;
	}

	@GetMapping
	ProvidersResponse providers() {
		return new ProvidersResponse(enabled.ids());
	}

	record ProvidersResponse(List<String> providers) {
	}

}
