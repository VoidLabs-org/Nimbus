package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * The Profile page's "Last changed": when the User's password was last set, however it was set. Times are compared
 * to the microsecond, which is what Postgres keeps.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class PasswordLastChangedTests {

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Test
	void signingUpWithAPasswordSetsIt() {
		var signedUp = clock.instant().truncatedTo(ChronoUnit.MICROS);
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", "plc1@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();

		assertThat(changedAt(JsonPath.read(response, "$.accessToken"))).isEqualTo(signedUp);
	}

	@Test
	void aUserWithoutAPasswordHasNoneUntilTheySetOneAndChangingItMovesIt() {
		var user = externalSignIn
			.signIn(new ExternalProfile("google", "g-plc2", "plc2@example.com", true, "Someone", null, "plc2@example.com"));
		var token = accessTokens.issueFor(user, sessions.start(user, null, false).sessionId());
		me(token).expectStatus().isOk().expectBody().jsonPath("$.passwordChangedAt").isEmpty();

		var set = clock.instant().truncatedTo(ChronoUnit.MICROS);
		changePassword(token, Map.of("newPassword", "first password")).expectStatus().isNoContent();
		assertThat(changedAt(token)).isEqualTo(set);

		clock.advance(Duration.ofDays(3));
		var changed = clock.instant().truncatedTo(ChronoUnit.MICROS);
		changePassword(token, Map.of("currentPassword", "first password", "newPassword", "second password"))
			.expectStatus().isNoContent();
		assertThat(changedAt(token)).isEqualTo(changed);
	}

	@Test
	void resettingAForgottenPasswordMovesIt() {
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", "plc3@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated();
		// Registration spent the address's send budget.
		clock.advance(Duration.ofSeconds(61));
		client.post().uri("/api/auth/password-reset").body(Map.of("email", "plc3@example.com"))
			.exchange().expectStatus().isNoContent();
		await().atMost(Duration.ofSeconds(10)).until(() -> RecordingMailer.sentTo("plc3@example.com").size() >= 2);

		var reset = clock.instant().truncatedTo(ChronoUnit.MICROS);
		client.post().uri("/api/auth/password-reset/confirm")
			.body(Map.of("email", "plc3@example.com", "code", RecordingMailer.lastCodeFor("plc3@example.com"),
					"newPassword", "new password"))
			.exchange().expectStatus().isNoContent();

		// The reset signed every session out, so sign in again to look.
		var signedIn = client.post().uri("/api/auth/login")
			.body(Map.of("email", "plc3@example.com", "password", "new password"))
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat(changedAt(JsonPath.read(signedIn, "$.accessToken"))).isEqualTo(reset);
	}

	private Instant changedAt(String token) {
		String body = me(token).expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		return Instant.parse(JsonPath.<String>read(body, "$.passwordChangedAt"));
	}

	private RestTestClient.ResponseSpec me(String token) {
		return client.get().uri("/api/users/me").header("Authorization", "Bearer " + token).exchange();
	}

	private RestTestClient.ResponseSpec changePassword(String token, Map<String, String> body) {
		return client.put().uri("/api/users/me/password").header("Authorization", "Bearer " + token)
			.body(body)
			.exchange();
	}

}
