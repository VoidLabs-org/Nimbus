package com.nimbus.api.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.List;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * The person who owns the admin email registered it with a password and never entered the Verification code. A
 * password reset proves the address too, so they become Platform admin. A class of its own: it needs its own admin
 * email, and so its own database.
 */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@TestPropertySource(properties = { "nimbus.admin.email=reset-owner@example.com", "nimbus.admin.password=" })
class AdminEmailVerifiedByResetTests {

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Test
	void theRealOwnerBecomesPlatformAdminAfterResettingThePassword() {
		var email = "reset-owner@example.com";
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Owner", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated();
		// Registering mailed a Verification code; the address may be mailed again a minute later.
		clock.advance(Duration.ofSeconds(61));

		client.post().uri("/api/auth/password-reset").body(Map.of("email", email))
			.exchange().expectStatus().isNoContent();
		await().atMost(Duration.ofSeconds(10)).until(() -> RecordingMailer.sentTo(email).size() == 2);
		client.post().uri("/api/auth/password-reset/confirm")
			.body(Map.of("email", email, "code", RecordingMailer.lastCodeFor(email), "newPassword", "owners password"))
			.exchange().expectStatus().isNoContent();

		var response = client.post().uri("/api/auth/login")
			.body(Map.of("email", email, "password", "owners password"))
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		// The grant follows the EmailVerified event, which access handles after the commit.
		await().atMost(Duration.ofSeconds(10)).until(() -> client.get().uri("/api/access/roles")
			.header("Authorization", "Bearer " + token)
			.exchange().returnResult(String.class).getStatus().value() == 200);
		var mine = client.get().uri("/api/access/me/permissions")
			.header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody();
		assertThat((List<String>) JsonPath.read(mine, "$.platform")).contains("access:role:manage");
	}

}
