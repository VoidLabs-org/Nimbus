package com.nimbus.api.identity;

import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * A person who opens an API address in the browser without a token (a bookmark, a link) is sent to the web app's
 * sign-in page, whatever number of providers is on. The tests run with both Google and GitHub on, the setup in
 * which Spring's own redirect used to land on a page on the API host.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class PageLoadSignInTests {

	@Autowired
	RestTestClient client;

	@Test
	void aBrowserPageLoadOfAnApiUrlGoesToTheWebAppsSignInPage() {
		client.get().uri("/api/users/me")
			.header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
			.exchange()
			.expectStatus().isFound()
			.expectHeader().valueEquals("Location", "http://localhost:3000/login");
	}

	@Test
	void theRedirectIsNeverCached() {
		client.get().uri("/api/users/me")
			.header("Accept", "text/html")
			.exchange()
			.expectHeader().valueEquals("Cache-Control", "no-store");
	}

	@Test
	void aRequestThatOnlyAcceptsPlainTextOrAnImageAlsoGoesToTheWebApp() {
		for (var accept : new String[] { "text/plain", "image/png" }) {
			client.get().uri("/api/users/me")
				.header("Accept", accept)
				.exchange()
				.expectStatus().isFound()
				.expectHeader().valueEquals("Location", "http://localhost:3000/login");
		}
	}

	// Only reading a page is a page load; a form post or an update needs a status it can handle.
	@Test
	void aWriteThatAcceptsHtmlStillGetsA401() {
		client.post().uri("/api/users/me")
			.header("Accept", "text/html")
			.exchange()
			.expectStatus().isUnauthorized();
	}

	// fetch and curl accept anything; only a request that asks for a page by name is a page load.
	@Test
	void aRequestThatAcceptsAnythingStillGetsA401() {
		client.get().uri("/api/users/me")
			.header("Accept", "*/*")
			.exchange()
			.expectStatus().isUnauthorized();
	}

	@Test
	void anApiCallWithoutATokenStillGetsA401() {
		client.get().uri("/api/users/me")
			.header("Accept", "application/json")
			.exchange()
			.expectStatus().isUnauthorized();
	}

}
