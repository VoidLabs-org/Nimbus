package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.OAuth2AccessToken;

/** Google's tokens are only used during the handshake: nothing may keep them afterwards. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class NoStoredProviderTokensTests {

	@Autowired
	OAuth2AuthorizedClientRepository authorizedClients;

	@Test
	void anAuthorizedClientSavedAfterTheHandshakeCannotBeLoadedAgain() {
		var registration = CommonOAuth2Provider.GOOGLE.getBuilder("google")
			.clientId("test-google-client")
			.clientSecret("test-google-secret")
			.build();
		var token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "google-access-token", Instant.now(),
				Instant.now().plusSeconds(3600));
		var login = new TestingAuthenticationToken("110169484474386276334", "n/a");
		var request = new MockHttpServletRequest();

		authorizedClients.saveAuthorizedClient(new OAuth2AuthorizedClient(registration, login.getName(), token), login,
				request, new MockHttpServletResponse());

		OAuth2AuthorizedClient loaded = authorizedClients.loadAuthorizedClient("google", login, request);
		assertThat(loaded).isNull();
	}

}
