package com.nimbus.api.identity.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;

/**
 * Registers Google as a sign-in provider when {@code GOOGLE_CLIENT_ID} is set; without it "Continue with
 * Google" is simply off and the rest of the app is unaffected. Spring Boot's own
 * {@code spring.security.oauth2.client.*} properties are not used because an empty client id would stop startup.
 * Google only accepts the exact redirect URI registered for the client, so it is built from the configured public
 * URL, not from the request: behind the dev proxy or a load balancer the request's host is not the browser's.
 */
@Configuration
class GoogleClientConfig {

	private static final String CALLBACK_PATH = "/api/auth/oauth2/callback/" + GoogleProfiles.PROVIDER;

	@Bean
	@ConditionalOnExpression("!'${nimbus.auth.google.client-id:}'.isBlank()")
	ClientRegistrationRepository googleClientRegistrations(@Value("${nimbus.auth.google.client-id}") String clientId,
			@Value("${nimbus.auth.google.client-secret:}") String clientSecret, AuthProperties properties) {
		var google = CommonOAuth2Provider.GOOGLE.getBuilder(GoogleProfiles.PROVIDER)
			.clientId(clientId.strip())
			.clientSecret(clientSecret.strip())
			.redirectUri(properties.publicUrl() + CALLBACK_PATH)
			.build();
		return new InMemoryClientRegistrationRepository(google);
	}

	/** Provider tokens are never stored (see {@link NoStoredProviderTokens}). */
	@Bean
	@ConditionalOnExpression("!'${nimbus.auth.google.client-id:}'.isBlank()")
	OAuth2AuthorizedClientRepository authorizedClientRepository() {
		return new NoStoredProviderTokens();
	}

}
