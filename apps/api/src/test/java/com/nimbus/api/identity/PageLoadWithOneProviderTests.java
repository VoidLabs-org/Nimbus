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
 * Only GitHub is on. A browser page load of an API address without a token goes to the web app's sign-in page, as with two
 * providers. A call that accepts anything still gets a 401.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.auth.google.client-id=" })
class PageLoadWithOneProviderTests {

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
