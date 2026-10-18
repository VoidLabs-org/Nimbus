package com.nimbus.api.identity;

import java.util.List;
import java.util.Map;
import java.util.UUID;

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
class SessionSignOutOthersTests {

	static final String CHROME_ON_WINDOWS = SessionListTests.CHROME_ON_WINDOWS;

	static final String SAFARI_ON_IPHONE = SessionListTests.SAFARI_ON_IPHONE;

	@Autowired
	RestTestClient client;

	@Test
	void endsEveryOtherSessionAndKeepsTheCurrentOne() {
		register("Ada", "ada-others@example.com");
		var phone = signIn("ada-others@example.com", SAFARI_ON_IPHONE);
		var tablet = signIn("ada-others@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("ada-others@example.com", CHROME_ON_WINDOWS);

		signOutOthers(laptop.accessToken()).expectStatus().isNoContent();

		refresh(phone.refreshToken()).expectStatus().isUnauthorized();
		refresh(tablet.refreshToken()).expectStatus().isUnauthorized();
		refresh(laptop.refreshToken()).expectStatus().isOk();
		assertThat(devices(laptop.accessToken())).containsExactly("Chrome on Windows");
	}

	@Test
	void givesNoContentWhenThereAreNoOtherSessions() {
		register("Babbage", "babbage-others@example.com");
		var only = signIn("babbage-others@example.com", CHROME_ON_WINDOWS);
		signOutOthers(only.accessToken()).expectStatus().isNoContent();

		signOutOthers(only.accessToken()).expectStatus().isNoContent();

		refresh(only.refreshToken()).expectStatus().isOk();
	}

	@Test
	void leavesOtherUsersSessionsAlone() {
		register("Curie", "curie-others@example.com");
		register("Dijkstra", "dijkstra-others@example.com");
		var curie = signIn("curie-others@example.com", CHROME_ON_WINDOWS);
		var dijkstra = signIn("dijkstra-others@example.com", SAFARI_ON_IPHONE);

		signOutOthers(curie.accessToken()).expectStatus().isNoContent();

		refresh(dijkstra.refreshToken()).expectStatus().isOk();
	}

	@Test
	void aSessionThatEndedCannotSignOutOthersWhileItsAccessTokenStillWorks() {
		register("Euler", "euler-others@example.com");
		var phone = signIn("euler-others@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("euler-others@example.com", CHROME_ON_WINDOWS);
		logout(laptop.refreshToken());

		signOutOthers(laptop.accessToken()).expectStatus().isUnauthorized();

		refresh(phone.refreshToken()).expectStatus().isOk();
	}

	@Test
	void anUnverifiedUserIsStoppedByTheEmailGate() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Fermat", "email", "fermat-others@example.com", "password",
					"correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		signOutOthers(JsonPath.read(response, "$.accessToken")).expectStatus().isForbidden()
			.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void needsASignedInUser() {
		client.post().uri("/api/users/me/sessions/sign-out-others").exchange().expectStatus().isUnauthorized();
	}

	record SignedIn(String accessToken, String refreshToken) {
	}

	private void register(String displayName, String email) {
		var response = client.post().uri("/api/auth/register")
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

	private RestTestClient.ResponseSpec signOutOthers(String accessToken) {
		return client.post().uri("/api/users/me/sessions/sign-out-others")
			.header("Authorization", "Bearer " + accessToken)
			.exchange();
	}

	private RestTestClient.ResponseSpec refresh(String refreshToken) {
		return client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "nimbus")
			.cookie("refresh_token", refreshToken)
			.exchange();
	}

	private void logout(String refreshToken) {
		client.post().uri("/api/auth/logout")
			.header("X-Requested-With", "nimbus")
			.cookie("refresh_token", refreshToken)
			.exchange()
			.expectStatus().isNoContent();
	}

	private String listBody(String accessToken) {
		return client.get().uri("/api/users/me/sessions")
			.header("Authorization", "Bearer " + accessToken)
			.exchange()
			.expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
	}

	private List<String> devices(String accessToken) {
		return JsonPath.read(listBody(accessToken), "$[*].device");
	}

}
