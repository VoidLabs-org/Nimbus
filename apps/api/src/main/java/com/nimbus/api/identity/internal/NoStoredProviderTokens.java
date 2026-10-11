package com.nimbus.api.identity.internal;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;

/**
 * Keeps nothing. After a successful login Spring hands the provider's access (and refresh) token to an
 * authorized-client repository, whose default holds them in memory per User. We only need the ID token's claims to
 * sign the User in, so Google's tokens are dropped as soon as the handshake ends.
 */
class NoStoredProviderTokens implements OAuth2AuthorizedClientRepository {

	@Override
	public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String clientRegistrationId,
			Authentication principal, HttpServletRequest request) {
		return null;
	}

	@Override
	public void saveAuthorizedClient(OAuth2AuthorizedClient authorizedClient, Authentication principal,
			HttpServletRequest request, HttpServletResponse response) {
	}

	@Override
	public void removeAuthorizedClient(String clientRegistrationId, Authentication principal,
			HttpServletRequest request, HttpServletResponse response) {
	}

}
