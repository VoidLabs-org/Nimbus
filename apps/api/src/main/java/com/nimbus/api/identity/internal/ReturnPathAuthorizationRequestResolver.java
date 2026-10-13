package com.nimbus.api.identity.internal;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

/**
 * Starts the handshake at {@code /api/auth/oauth2/<provider>} as Spring does, and also remembers the page it
 * started from ({@link ReturnPath}). The redirect to the provider is Spring's own, so the page is not in it.
 */
class ReturnPathAuthorizationRequestResolver implements OAuth2AuthorizationRequestResolver {

	static final String BASE_URI = "/api/auth/oauth2";

	private final OAuth2AuthorizationRequestResolver spring;

	ReturnPathAuthorizationRequestResolver(ClientRegistrationRepository registrations) {
		this.spring = new DefaultOAuth2AuthorizationRequestResolver(registrations, BASE_URI);
	}

	@Override
	public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
		return remembering(request, spring.resolve(request));
	}

	@Override
	public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String clientRegistrationId) {
		return remembering(request, spring.resolve(request, clientRegistrationId));
	}

	private static OAuth2AuthorizationRequest remembering(HttpServletRequest request,
			OAuth2AuthorizationRequest authorization) {
		if (authorization != null) {
			ReturnPath.remember(request);
		}
		return authorization;
	}

}
