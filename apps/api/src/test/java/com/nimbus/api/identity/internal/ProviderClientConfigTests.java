package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.TestPropertySource;

/** Providers only accept the exact redirect URI registered for the client, so it must not depend on the request. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@TestPropertySource(properties = "nimbus.auth.public-url=https://nimbus.example.com/")
class ProviderClientConfigTests {

	@Autowired
	ClientRegistrationRepository registrations;

	@Test
	void googleIsToldToReturnToTheConfiguredPublicUrl() {
		var google = registrations.findByRegistrationId("google");

		assertThat(google.getRedirectUri()).isEqualTo("https://nimbus.example.com/api/auth/oauth2/callback/google");
	}

	@Test
	void githubIsToldToReturnToTheConfiguredPublicUrlAndAsksForTheEmailScope() {
		var github = registrations.findByRegistrationId("github");

		assertThat(github.getRedirectUri()).isEqualTo("https://nimbus.example.com/api/auth/oauth2/callback/github");
		assertThat(github.getScopes()).contains("user:email");
	}

}
