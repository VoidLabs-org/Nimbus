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
class SessionSignOutOneTests {

	static final String CHROME_ON_WINDOWS = SessionListTests.CHROME_ON_WINDOWS;

	static final String SAFARI_ON_IPHONE = SessionListTests.SAFARI_ON_IPHONE;

	@Autowired
	RestTestClient client;

	@Test
	void endsThatSessionSoItsRefreshStopsWorkingWhileTheOthersKeepWorking() {
		register("Ada", "ada-one@example.com");
		var phone = signIn("ada-one@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("ada-one@example.com", CHROME_ON_WINDOWS);
		var phoneId = idOfDevice(laptop.accessToken(), "Safari on iOS");

		signOut(laptop.accessToken(), phoneId).expectStatus().isNoContent();

		refresh(phone.refreshToken()).expectStatus().isUnauthorized();
		refresh(laptop.refreshToken()).expectStatus().isOk();
		assertThat(devices(laptop.accessToken())).doesNotContain("Safari on iOS").contains("Chrome on Windows");
	}

	@Test
	void theEndedSessionsAccessTokenKeepsWorkingForItsRemainingLife() {
		register("Babbage", "babbage-one@example.com");
		var phone = signIn("babbage-one@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("babbage-one@example.com", CHROME_ON_WINDOWS);

		signOut(laptop.accessToken(), idOfDevice(laptop.accessToken(), "Safari on iOS")).expectStatus()
			.isNoContent();

		// Not on the list or here: an endpoint that doesn't check the session still accepts the token.
		client.get().uri("/api/users/me").header("Authorization", "Bearer " + phone.accessToken()).exchange()
			.expectStatus().isOk();
	}

	@Test
	void anAlreadyEndedSessionOfTheSameUserAlsoGivesNoContent() {
		register("Curie", "curie-one@example.com");
		var phone = signIn("curie-one@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("curie-one@example.com", CHROME_ON_WINDOWS);
		var phoneId = idOfDevice(laptop.accessToken(), "Safari on iOS");
		logout(phone.refreshToken());

		signOut(laptop.accessToken(), phoneId).expectStatus().isNoContent();
		signOut(laptop.accessToken(), phoneId).expectStatus().isNoContent();
	}

	@Test
	void anUnknownIdIsNotFound() {
		register("Dijkstra", "dijkstra-one@example.com");
		var laptop = signIn("dijkstra-one@example.com", CHROME_ON_WINDOWS);

		signOut(laptop.accessToken(), UUID.randomUUID().toString()).expectStatus().isNotFound();
	}

	@Test
	void anIdThatIsNotAUuidIsNotFound() {
		register("Turing", "turing-one@example.com");
		var laptop = signIn("turing-one@example.com", CHROME_ON_WINDOWS);

		signOut(laptop.accessToken(), "abc").expectStatus().isNotFound();
	}

	@Test
	void anotherUsersSessionIsNotFoundAndStaysRunning() {
		register("Euler", "euler-one@example.com");
		register("Fermat", "fermat-one@example.com");
		var euler = signIn("euler-one@example.com", CHROME_ON_WINDOWS);
		var fermat = signIn("fermat-one@example.com", SAFARI_ON_IPHONE);
		var fermatsId = idOfDevice(fermat.accessToken(), "Safari on iOS");

		signOut(euler.accessToken(), fermatsId).expectStatus().isNotFound();

		refresh(fermat.refreshToken()).expectStatus().isOk();
	}

	@Test
	void aSessionThatEndedCannotSignOutOthersWhileItsAccessTokenStillWorks() {
		register("Gauss", "gauss-one@example.com");
		var phone = signIn("gauss-one@example.com", SAFARI_ON_IPHONE);
		var laptop = signIn("gauss-one@example.com", CHROME_ON_WINDOWS);
		var phoneId = idOfDevice(laptop.accessToken(), "Safari on iOS");
		logout(laptop.refreshToken());

		signOut(laptop.accessToken(), phoneId).expectStatus().isUnauthorized();

		refresh(phone.refreshToken()).expectStatus().isOk();
	}

	@Test
	void anUnverifiedUserIsStoppedByTheEmailGate() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Hopper", "email", "hopper-one@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		signOut(JsonPath.read(response, "$.accessToken"), UUID.randomUUID().toString()).expectStatus()
			.isForbidden().expectBody().jsonPath("$.code").isEqualTo("email_unverified");
	}

	@Test
	void needsASignedInUser() {
		client.delete().uri("/api/users/me/sessions/" + UUID.randomUUID()).exchange().expectStatus()
			.isUnauthorized();
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

	private RestTestClient.ResponseSpec signOut(String accessToken, String sessionId) {
		return client.delete().uri("/api/users/me/sessions/" + sessionId)
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

	private String idOfDevice(String accessToken, String device) {
		List<String> ids = JsonPath.read(listBody(accessToken), "$[?(@.device == '" + device + "')].id");
		return ids.getFirst();
	}

}
