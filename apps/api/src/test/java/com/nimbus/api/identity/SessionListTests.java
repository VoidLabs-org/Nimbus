package com.nimbus.api.identity;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

import static org.assertj.core.api.Assertions.assertThat;

@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class SessionListTests {

	static final String CHROME_ON_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
			+ "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

	static final String SAFARI_ON_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) "
			+ "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

	static final String FIREFOX_ON_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Test
	void listsEveryRunningSessionWithItsDeviceLabelAndThisBrowserFirst() {
		register("Ada", "ada-list@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("ada-list@example.com", CHROME_ON_WINDOWS);

		var body = list(laptop.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		assertThat(JsonPath.<Integer>read(body, "$.length()")).isEqualTo(2);
		assertThat(JsonPath.<String>read(body, "$[0].device")).isEqualTo("Chrome on Windows");
		assertThat(JsonPath.<Boolean>read(body, "$[0].current")).isTrue();
		assertThat(JsonPath.<String>read(body, "$[1].device")).isEqualTo("Safari on iOS");
		assertThat(JsonPath.<Boolean>read(body, "$[1].current")).isFalse();
		assertThat(JsonPath.<String>read(body, "$[0].id")).isNotBlank().isNotEqualTo(JsonPath.read(body, "$[1].id"));
		assertThat(JsonPath.<String>read(body, "$[0].startedAt")).isNotBlank();
		assertThat(JsonPath.<String>read(body, "$[0].lastActiveAt")).isNotBlank();
		assertThat(body).doesNotContain("Mozilla");
	}

	@Test
	void ordersTheOtherSessionsByWhenTheyWereLastUsed() {
		register("Babbage", "babbage-list@example.com", SAFARI_ON_IPHONE);
		var firefox = signIn("babbage-list@example.com", FIREFOX_ON_LINUX);
		clock.advance(Duration.ofHours(2));
		refresh(firefox.refreshToken(), FIREFOX_ON_LINUX);
		clock.advance(Duration.ofHours(1));
		var laptop = signIn("babbage-list@example.com", CHROME_ON_WINDOWS);

		var body = list(laptop.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		assertThat(JsonPath.<java.util.List<String>>read(body, "$[*].device"))
			.containsExactly("Chrome on Windows", "Firefox on Linux", "Safari on iOS");
	}

	@Test
	void aRefreshMovesLastActiveButNeverChangesTheDevice() {
		register("Curie", "curie-list@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("curie-list@example.com", CHROME_ON_WINDOWS);
		var before = lastActiveAt(list(laptop.accessToken()));

		clock.advance(Duration.ofHours(3));
		var refreshed = refresh(laptop.refreshToken(), FIREFOX_ON_LINUX);

		var after = list(refreshed.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();
		assertThat(JsonPath.<String>read(after, "$[0].device")).isEqualTo("Chrome on Windows");
		assertThat(Instant.parse(JsonPath.read(after, "$[0].lastActiveAt"))).isAfter(before);
		assertThat(JsonPath.<String>read(after, "$[0].startedAt")).isEqualTo(startedAt(list(laptop.accessToken())));
	}

	@Test
	void leavesOutSessionsThatWereSignedOut() {
		register("Dijkstra", "dijkstra-list@example.com", SAFARI_ON_IPHONE);
		var phone = signIn("dijkstra-list@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("dijkstra-list@example.com", CHROME_ON_WINDOWS);
		logout(phone.refreshToken());

		var body = list(laptop.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		// The registration's session is still running; only the phone sign-in ended.
		assertThat(JsonPath.<Integer>read(body, "$.length()")).isEqualTo(2);
	}

	@Test
	void leavesOutSessionsIdleForThirtyDays() {
		register("Euler", "euler-list@example.com", SAFARI_ON_IPHONE);
		clock.advance(Duration.ofDays(31));
		var laptop = signIn("euler-list@example.com", CHROME_ON_WINDOWS);

		var body = list(laptop.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		assertThat(JsonPath.<java.util.List<String>>read(body, "$[*].device")).containsExactly("Chrome on Windows");
	}

	@Test
	void leavesOutSessionsPastTheNinetyDayCapEvenWhenKeptActive() {
		register("Fermat", "fermat-list@example.com", SAFARI_ON_IPHONE);
		var oldBrowser = signIn("fermat-list@example.com", FIREFOX_ON_LINUX);
		var token = oldBrowser.refreshToken();
		for (var i = 0; i < 3; i++) {
			clock.advance(Duration.ofDays(29));
			token = refresh(token, FIREFOX_ON_LINUX).refreshToken();
		}
		clock.advance(Duration.ofDays(4));
		var laptop = signIn("fermat-list@example.com", CHROME_ON_WINDOWS);

		var body = list(laptop.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		assertThat(JsonPath.<java.util.List<String>>read(body, "$[*].device")).containsExactly("Chrome on Windows");
	}

	@Test
	void showsOtherUsersNothing() {
		register("Gauss", "gauss-list@example.com", SAFARI_ON_IPHONE);
		register("Hopper", "hopper-list@example.com", FIREFOX_ON_LINUX);
		var gauss = signIn("gauss-list@example.com", CHROME_ON_WINDOWS);

		var body = list(gauss.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		assertThat(JsonPath.<java.util.List<String>>read(body, "$[*].device"))
			.containsExactly("Chrome on Windows", "Safari on iOS");
	}

	@Test
	void namesASessionWithNoOrAnUnrecognisedUserAgentUnknownBrowser() {
		register("Knuth", "knuth-list@example.com", "");
		var laptop = signIn("knuth-list@example.com", "garbage");

		var body = list(laptop.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		assertThat(JsonPath.<java.util.List<String>>read(body, "$[*].device"))
			.containsExactly("Unknown browser", "Unknown browser");
	}

	@Test
	void aVeryLongUserAgentDoesNotStopSigningIn() {
		register("Lovelace", "lovelace-list@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("lovelace-list@example.com", CHROME_ON_WINDOWS + " " + "x".repeat(2000));

		var body = list(laptop.accessToken()).expectStatus().isOk().expectBody(String.class).returnResult()
			.getResponseBody();

		assertThat(JsonPath.<String>read(body, "$[0].device")).isEqualTo("Chrome on Windows");
	}

	@Test
	void aSignedOutBrowserCannotListEvenWhileItsAccessTokenStillWorks() {
		register("Mauchly", "mauchly-list@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("mauchly-list@example.com", CHROME_ON_WINDOWS);
		logout(laptop.refreshToken());

		list(laptop.accessToken()).expectStatus().isUnauthorized();
	}

	@Test
	void anUnverifiedUserIsStoppedByTheEmailGate() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Noyce", "email", "noyce-list@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		list(JsonPath.read(response, "$.accessToken")).expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void needsASignedInUser() {
		client.get().uri("/api/users/me/sessions").exchange().expectStatus().isUnauthorized();
	}

	record SignedIn(String accessToken, String refreshToken) {
	}

	private void register(String displayName, String email, String userAgent) {
		var response = client.post().uri("/api/auth/register")
			.header("User-Agent", userAgent)
			.body(Map.of("displayName", displayName, "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		EmailCodes.verify(client, JsonPath.read(response, "$.accessToken"), email);
	}

	private SignedIn signIn(String email, String userAgent) {
		var result = client.post().uri("/api/auth/login")
			.header("User-Agent", userAgent)
			.body(Map.of("email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();
		return new SignedIn(JsonPath.read(result.getResponseBody(), "$.accessToken"),
				RefreshCookies.of(result).getValue());
	}

	private RestTestClient.ResponseSpec list(String accessToken) {
		return client.get().uri("/api/users/me/sessions")
			.header("Authorization", "Bearer " + accessToken)
			.exchange();
	}

	private SignedIn refresh(String refreshToken, String userAgent) {
		var result = client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "nimbus")
			.header("User-Agent", userAgent)
			.cookie("refresh_token", refreshToken)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();
		return new SignedIn(JsonPath.read(result.getResponseBody(), "$.accessToken"),
				RefreshCookies.of(result).getValue());
	}

	private void logout(String refreshToken) {
		client.post().uri("/api/auth/logout")
			.header("X-Requested-With", "nimbus")
			.cookie("refresh_token", refreshToken)
			.exchange()
			.expectStatus().isNoContent();
	}

	private Instant lastActiveAt(RestTestClient.ResponseSpec response) {
		return Instant.parse(JsonPath.read(
				response.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(),
				"$[0].lastActiveAt"));
	}

	private String startedAt(RestTestClient.ResponseSpec response) {
		return JsonPath.read(response.expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(),
				"$[0].startedAt");
	}

}
