package com.nimbus.api.identity.internal;

import java.util.ArrayList;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;

/**
 * Registers Google and GitHub as sign-in providers, each only when its client id ({@code GOOGLE_CLIENT_ID},
 * {@code GITHUB_CLIENT_ID}) is set; without it "Continue with ..." is simply off and the rest of the app is
 * unaffected. With neither set there are no OAuth beans at all. Spring Boot's own
 * {@code spring.security.oauth2.client.*} properties are not used because an empty client id would stop startup.
 * Providers only accept the exact redirect URI registered for the client, so it is built from the configured
 * public URL, not from the request: behind the dev proxy or a load balancer the request's host is not the
 * browser's.
 */
@Configuration
class ProviderClientConfig {

	private static final String CALLBACK_PATH = "/api/auth/oauth2/callback/";

	private static final String ANY_PROVIDER = "!'${nimbus.auth.google.client-id:}'.isBlank() "
			+ "|| !'${nimbus.auth.github.client-id:}'.isBlank()";

	@Bean
	@ConditionalOnExpression(ANY_PROVIDER)
	ClientRegistrationRepository providerClientRegistrations(
			@Value("${nimbus.auth.google.client-id:}") String googleId,
			@Value("${nimbus.auth.google.client-secret:}") String googleSecret,
			@Value("${nimbus.auth.github.client-id:}") String githubId,
			@Value("${nimbus.auth.github.client-secret:}") String githubSecret, AuthProperties properties) {
		var registrations = new ArrayList<ClientRegistration>();
		if (!googleId.isBlank()) {
			registrations.add(CommonOAuth2Provider.GOOGLE.getBuilder(GoogleProfiles.PROVIDER)
				.clientId(googleId.strip())
				.clientSecret(googleSecret.strip())
				.redirectUri(properties.publicUrl() + CALLBACK_PATH + GoogleProfiles.PROVIDER)
				.build());
		}
		if (!githubId.isBlank()) {
			registrations.add(CommonOAuth2Provider.GITHUB.getBuilder(GithubProfiles.PROVIDER)
				.clientId(githubId.strip())
				.clientSecret(githubSecret.strip())
				// read:user is Spring's default; user:email is what lets us read the verified addresses.
				.scope("read:user", "user:email")
				.redirectUri(properties.publicUrl() + CALLBACK_PATH + GithubProfiles.PROVIDER)
				.build());
		}
		return new InMemoryClientRegistrationRepository(registrations);
	}

	/** Provider tokens are never stored (see {@link NoStoredProviderTokens}). */
	@Bean
	@ConditionalOnExpression(ANY_PROVIDER)
	OAuth2AuthorizedClientRepository authorizedClientRepository() {
		return new NoStoredProviderTokens();
	}

}
