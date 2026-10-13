package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * The web app asks which providers it may offer, so it never shows a button that leads nowhere. Each
 * configuration needs its own application context, hence one nested class per set of client ids. The test
 * configuration sets both ids; the nested classes blank out the ones they don't want.
 */
class ProvidersTests {

	@Import(TestcontainersConfiguration.class)
	@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
	@AutoConfigureRestTestClient
	abstract static class Base {

		@Autowired
		RestTestClient client;

		RestTestClient.BodyContentSpec providers() {
			return client.get().uri("/api/auth/providers")
				.exchange()
				.expectStatus().isOk()
				.expectBody();
		}

	}

	@Nested
	class WithBothClientIds extends Base {

		@Test
		void listsGoogleThenGithubWithoutAnAccessToken() {
			providers().jsonPath("$.providers.length()").isEqualTo(2)
				.jsonPath("$.providers[0]").isEqualTo("google")
				.jsonPath("$.providers[1]").isEqualTo("github");
		}

		@Test
		void isNotCachedBecauseItFollowsTheServersConfiguration() {
			client.get().uri("/api/auth/providers")
				.exchange()
				.expectStatus().isOk()
				.expectHeader().value("Cache-Control", value -> assertThat(value).contains("no-store"));
		}

	}

	@Nested
	@TestPropertySource(properties = { "nimbus.auth.google.client-id=", "nimbus.auth.github.client-id=" })
	class WithNoClientIds extends Base {

		@Test
		void listsNoProviders() {
			providers().jsonPath("$.providers.length()").isEqualTo(0);
		}

	}

	@Nested
	@TestPropertySource(properties = "nimbus.auth.github.client-id=")
	class WithOnlyGoogle extends Base {

		@Test
		void listsOnlyGoogle() {
			providers().jsonPath("$.providers.length()").isEqualTo(1)
				.jsonPath("$.providers[0]").isEqualTo("google");
		}

	}

	@Nested
	@TestPropertySource(properties = "nimbus.auth.google.client-id=")
	class WithOnlyGithub extends Base {

		@Test
		void listsOnlyGithub() {
			providers().jsonPath("$.providers.length()").isEqualTo(1)
				.jsonPath("$.providers[0]").isEqualTo("github");
		}

	}

}
