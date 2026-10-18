package com.nimbus.api.identity;

import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class PasswordTests {

	@Autowired
	RestTestClient client;

	@Test
	void signedInUserCanChangeTheirPasswordAndSignInWithTheNewOne() {
		var accessToken = JsonPath.<String>read(register("change@example.com"), "$.accessToken");

		changePassword(accessToken, Map.of("currentPassword", "correct horse", "newPassword", "battery staple"))
			.expectStatus().isNoContent();

		login("change@example.com", "battery staple").expectStatus().isOk();
		login("change@example.com", "correct horse").expectStatus().isUnauthorized();
	}

	@Test
	void wrongCurrentPasswordIsRejectedAndNothingChanges() {
		var accessToken = JsonPath.<String>read(register("wrong@example.com"), "$.accessToken");

		for (var body : new Map[] { Map.of("currentPassword", "not it", "newPassword", "battery staple"),
				Map.of("newPassword", "battery staple") }) {
			@SuppressWarnings("unchecked")
			Map<String, String> request = body;
			changePassword(accessToken, request)
				.expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.errors.currentPassword").exists();
		}

		login("wrong@example.com", "correct horse").expectStatus().isOk();
	}

	@Test
	void tooManyWrongCurrentPasswordsBlockFurtherTriesEvenWithTheRightOne() {
		var accessToken = JsonPath.<String>read(register("guess@example.com"), "$.accessToken");

		for (var attempt = 0; attempt < 5; attempt++) {
			changePassword(accessToken, Map.of("currentPassword", "guess " + attempt, "newPassword", "battery staple"))
				.expectStatus().isBadRequest();
		}

		changePassword(accessToken, Map.of("currentPassword", "correct horse", "newPassword", "battery staple"))
			.expectStatus().isEqualTo(429)
			.expectHeader().exists("Retry-After");
		login("guess@example.com", "correct horse").expectStatus().isOk();
	}

	@Test
	void newPasswordFollowsTheRegistrationRules() {
		var accessToken = JsonPath.<String>read(register("rules@example.com"), "$.accessToken");

		for (var invalid : new String[] { "short", "x".repeat(129) }) {
			changePassword(accessToken, Map.of("currentPassword", "correct horse", "newPassword", invalid))
				.expectStatus().isBadRequest()
				.expectBody()
				.jsonPath("$.errors.newPassword").exists();
		}

		login("rules@example.com", "correct horse").expectStatus().isOk();
	}

	@Test
	void passwordCannotBeChangedWithoutSigningIn() {
		client.put().uri("/api/users/me/password")
			.body(Map.of("currentPassword", "correct horse", "newPassword", "battery staple"))
			.exchange()
			.expectStatus().isUnauthorized();
	}

	@Test
	void changingThePasswordEndsTheOtherSessionsButNotThisOne() {
		var thisBrowser = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", "sessions@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult();
		var accessToken = JsonPath.<String>read(thisBrowser.getResponseBody(), "$.accessToken");
		EmailCodes.verify(client, accessToken, "sessions@example.com");
		var otherBrowser = login("sessions@example.com", "correct horse")
			.expectStatus().isOk()
			.expectBody(String.class).returnResult();

		changePassword(accessToken, Map.of("currentPassword", "correct horse", "newPassword", "battery staple"))
			.expectStatus().isNoContent();

		refresh(RefreshCookies.valueOf(otherBrowser)).expectStatus().isUnauthorized();
		refresh(RefreshCookies.valueOf(thisBrowser)).expectStatus().isOk();
	}

	private RestTestClient.ResponseSpec refresh(String refreshToken) {
		return client.post().uri("/api/auth/refresh")
			.header("X-Requested-With", "nimbus")
			.cookie("refresh_token", refreshToken)
			.exchange();
	}

	private RestTestClient.ResponseSpec changePassword(String accessToken, Map<String, String> body) {
		return client.put().uri("/api/users/me/password")
			.header("Authorization", "Bearer " + accessToken)
			.body(body)
			.exchange();
	}

	private String register(String email) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		EmailCodes.verify(client, JsonPath.read(response, "$.accessToken"), email);
		return response;
	}

	private RestTestClient.ResponseSpec login(String email, String password) {
		return client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", password))
			.exchange();
	}

}
