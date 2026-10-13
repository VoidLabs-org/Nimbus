package com.nimbus.api.identity;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * No provider is on, so the sign-in page has only the email form. A browser page load of an API address without a token goes to the web app's sign-in page, as with two
 * providers. A call that accepts anything still gets a 401.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.auth.google.client-id=", "nimbus.auth.github.client-id=" })
class PageLoadWithNoProviderTests {

	@Autowired
	RestTestClient client;

	@Test
	void aBrowserPageLoadOfAnApiUrlGoesToTheWebAppsSignInPage() {
		client.get().uri("/api/users/me")
			.header("Accept", "text/html")
			.exchange()
			.expectStatus().isFound()
			.expectHeader().valueEquals("Location", "http://localhost:3000/login");
	}

	@Test
	void aRequestThatAcceptsAnythingStillGetsA401() {
		client.get().uri("/api/users/me")
			.header("Accept", "*/*")
			.exchange()
			.expectStatus().isUnauthorized();
	}

}
