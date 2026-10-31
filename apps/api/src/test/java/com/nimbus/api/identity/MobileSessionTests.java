package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * The Mobile app's sessions (ADR 0010): with {@code X-Nimbus-Client: mobile} the refresh token travels in the body,
 * never in a cookie. Each test sets it beside what a browser gets, which {@link SessionTests} covers in full.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class MobileSessionTests {

	private static final String MOBILE = "X-Nimbus-Client";

	@Autowired
	RestTestClient client;

	@Test
	void signingInAsTheMobileAppAnswersTheRefreshTokenInTheBodyAndSetsNoCookie() {
		register("Ada", "ada@example.com");

		var phone = client.post().uri("/api/auth/login")
			.header(MOBILE, "mobile")
			.body(Map.of("email", "ada@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();
		var browser = client.post().uri("/api/auth/login")
			.body(Map.of("email", "ada@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();

		assertThat(phone.getResponseHeaders().get(HttpHeaders.SET_COOKIE)).isNull();
		assertThat(JsonPath.<String>read(phone.getResponseBody(), "$.refreshToken")).isNotBlank();
		assertThat(JsonPath.<String>read(phone.getResponseBody(), "$.accessToken")).isNotBlank();
		assertThat(RefreshCookies.valueOf(browser)).isNotBlank();
		assertThat(browser.getResponseBody()).doesNotContain("refreshToken");
	}

	@Test
	void refreshingWithTheTokenInTheBodyRotatesItAndNeedsNoBrowserHeader() {
		register("Babbage", "babbage@example.com");
		var signedIn = signedInToken("babbage@example.com");

		var result = refresh(signedIn).expectStatus().isOk().expectBody(String.class).returnResult();

		assertThat(result.getResponseHeaders().get(HttpHeaders.SET_COOKIE)).isNull();
		String rotated = JsonPath.read(result.getResponseBody(), "$.refreshToken");
		assertThat(rotated).isNotBlank().isNotEqualTo(signedIn);
		client.get().uri("/api/users/me")
			.header("Authorization", "Bearer " + JsonPath.<String>read(result.getResponseBody(), "$.accessToken"))
			.exchange()
			.expectStatus().isOk()
			.expectBody().jsonPath("$.displayName").isEqualTo("Babbage");
	}

	// As with the cookie: a used token showing up again means someone copied it, so the whole Session ends.
	@Test
	void reusingARefreshTokenEndsTheSession() {
		register("Curie", "curie@example.com");
		var first = signedInToken("curie@example.com");
		var next = refreshedToken(first);

		refresh(first).expectStatus().isUnauthorized();

		refresh(next).expectStatus().isUnauthorized();
	}

	@Test
	void aMissingOrUnknownTokenInTheBodyIsRejected() {
		client.post().uri("/api/auth/refresh").header(MOBILE, "mobile").exchange().expectStatus().isUnauthorized();
		refresh("not-a-token").expectStatus().isUnauthorized();
	}

	@Test
	void signingOutWithTheTokenInTheBodyEndsThatSessionOnly() {
		register("Dijkstra", "dijkstra@example.com");
		var phone = signedInToken("dijkstra@example.com");
		var tablet = signedInToken("dijkstra@example.com");

		client.post().uri("/api/auth/logout")
			.header(MOBILE, "mobile")
			.body(Map.of("refreshToken", phone))
			.exchange()
			.expectStatus().isNoContent();

		refresh(phone).expectStatus().isUnauthorized();
		refresh(tablet).expectStatus().isOk();
	}

	// The two modes don't mix: a browser's cookie means nothing to a mobile request, and a body token nothing to a
	// browser's.
	@Test
	void eachModeReadsOnlyItsOwnToken() {
		register("Euler", "euler@example.com");
		var browserCookie = RefreshCookies.valueOf(client.post().uri("/api/auth/login")
			.body(Map.of("email", "euler@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult());
		var phoneToken = signedInToken("euler@example.com");

		client.post().uri("/api/auth/refresh")
			.header(MOBILE, "mobile")
			.cookie("refresh_token", browserCookie)
			.exchange()
			.expectStatus().isUnauthorized();
		client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "nimbus")
			.body(Map.of("refreshToken", phoneToken))
			.exchange()
			.expectStatus().isUnauthorized();
		refresh(phoneToken).expectStatus().isOk();
	}

	@Test
	void theSessionsListNamesThePhone() {
		register("Fermat", "fermat@example.com");
		var result = client.post().uri("/api/auth/login")
			.header(MOBILE, "mobile")
			.header(HttpHeaders.USER_AGENT, "Nimbus/1.0.0 (Android 15)")
			.body(Map.of("email", "fermat@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();

		client.get().uri("/api/users/me/sessions")
			.header("Authorization", "Bearer " + JsonPath.<String>read(result.getResponseBody(), "$.accessToken"))
			.exchange()
			.expectStatus().isOk()
			.expectBody()
			.jsonPath("$[0].device").isEqualTo("Nimbus for Android")
			.jsonPath("$[0].current").isEqualTo(true);
	}

	private String signedInToken(String email) {
		var result = client.post().uri("/api/auth/login")
			.header(MOBILE, "mobile")
			.body(Map.of("email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();
		return JsonPath.read(result.getResponseBody(), "$.refreshToken");
	}

	private String refreshedToken(String refreshToken) {
		var result = refresh(refreshToken).expectStatus().isOk().expectBody(String.class).returnResult();
		return JsonPath.read(result.getResponseBody(), "$.refreshToken");
	}

	private RestTestClient.ResponseSpec refresh(String refreshToken) {
		return client.post().uri("/api/auth/refresh")
			.header(MOBILE, "mobile")
			.body(Map.of("refreshToken", refreshToken))
			.exchange();
	}

	private void register(String displayName, String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", displayName, "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		EmailCodes.verify(client, JsonPath.read(response, "$.accessToken"), email);
	}

}
