package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.SignedIn;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.Scenario;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Exercises the recorded, after-commit listener through the module and its HTTP output. */
@Import({ TestcontainersConfiguration.class, RecordingMailer.class })
@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.ALL_DEPENDENCIES,
	webEnvironment = org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class SignInListenerTests {
	@Autowired RestTestClient client;
	@Autowired org.springframework.jdbc.core.simple.JdbcClient jdbc;

	@Test
	void committedSignInIsDeliveredAndItsSnapshotSurvivesAUserRename(Scenario scenario) {
		var email = "listener-signin@example.com";
		var registered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Ada", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registered, "$.accessToken");
		var user = UUID.fromString(JsonPath.read(registered, "$.user.id"));
		client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(token))
			.body(Map.of("code", RecordingMailer.lastCodeFor(email))).exchange().expectStatus().isOk();
		var event = new SignedIn(user, UUID.randomUUID(), "Safari on iPhone", Instant.parse("2026-10-19T08:00:00Z"));
		scenario.publish(event).andWaitForStateChange(() ->
			RecordingMailer.sentTo(email).stream().filter(m -> m.subject().equals("New sign-in to your account")).toList(),
			mails -> mails.size() == 1).andVerify(mails -> assertThat(mails.getFirst().text()).contains("Safari on iPhone"));
		client.patch().uri("/api/users/me").headers(h -> h.setBearerAuth(token))
			.body(Map.of("displayName", "Ada Renamed")).exchange().expectStatus().isOk();
		client.get().uri("/api/notifications").headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isOk()
			.expectBody().jsonPath("$.items[0].snapshot.deviceLabel").isEqualTo("Safari on iPhone")
			.jsonPath("$.items[0].createdAt").isEqualTo("2026-10-19T08:00:00Z");
	}

	@Test
	void unverifiedUserGetsNoAlertEmailOrNotification(Scenario scenario) {
		var email = "listener-unverified@example.com";
		var registered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Una", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		var user = UUID.fromString(JsonPath.read(registered, "$.user.id"));
		var other = "listener-after-unverified@example.com";
		var otherRegistered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Vera", "email", other, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String otherToken = JsonPath.read(otherRegistered, "$.accessToken");
		var otherUser = UUID.fromString(JsonPath.read(otherRegistered, "$.user.id"));
		client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(otherToken))
			.body(Map.of("code", RecordingMailer.lastCodeFor(other))).exchange().expectStatus().isOk();
		scenario.publish(new SignedIn(user, UUID.randomUUID(), "Safari on iPhone", Instant.parse("2026-10-19T08:00:00Z")));
		// Once the later, verified User's alert has arrived, the earlier event has been handled too.
		scenario.publish(new SignedIn(otherUser, UUID.randomUUID(), "Safari on iPhone", Instant.parse("2026-10-19T08:01:00Z")))
			.andWaitForStateChange(() -> RecordingMailer.sentTo(other).stream()
				.filter(m -> m.subject().equals("New sign-in to your account")).toList(), mails -> mails.size() == 1)
			.andVerify(mails -> {
				assertThat(RecordingMailer.sentTo(email).stream().filter(m -> m.subject().equals("New sign-in to your account"))).isEmpty();
				assertThat(jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :user").param("user", user).query(Long.class).single()).isZero();
			});
	}
}
