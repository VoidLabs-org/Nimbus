package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.SignedIn;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.client.RestTestClient;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class NotificationTests {

	@Autowired RestTestClient client;
	@Autowired ApplicationEventPublisher events;
	@Autowired TransactionTemplate transaction;

	@Test
	void aRolledBackSignInCreatesNeitherANotificationNorAnEmail() {
		var email = "notifications-rollback@example.com";
		var registered = register(email);
		String token = JsonPath.read(registered, "$.accessToken");
		var user = UUID.fromString(JsonPath.read(registered, "$.user.id"));
		verify(token, email);
		transaction.executeWithoutResult(status -> {
			events.publishEvent(new SignedIn(user, UUID.randomUUID(), "Firefox on Linux", java.time.Instant.now()));
			status.setRollbackOnly();
		});
		await().during(java.time.Duration.ofMillis(300)).untilAsserted(() -> {
			assertThat(JsonPath.<Integer>read(list(token), "$.items.length()")).isZero();
			assertThat(RecordingMailer.sentTo(email)).noneMatch(m -> m.subject().equals("New sign-in to your account"));
		});
	}

	@Test
	void everyEndpointRequiresASignedInVerifiedUser() {
		var registered = register("notifications-unverified@example.com");
		String token = JsonPath.read(registered, "$.accessToken");
		for (var path : java.util.List.of("/api/notifications", "/api/notifications/unread-count")) {
			client.get().uri(path).exchange().expectStatus().isUnauthorized();
			client.get().uri(path).headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isForbidden()
				.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
		}
		for (var path : java.util.List.of("/api/notifications/read-all", "/api/notifications/" + UUID.randomUUID() + "/read")) {
			client.post().uri(path).exchange().expectStatus().isUnauthorized();
			client.post().uri(path).headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isForbidden()
				.expectBody().jsonPath("$.code").isEqualTo("email_unverified");
		}
	}

	@Test
	void pagesAreNewestFirstAndDoNotLoseNotificationsWithTheSameTimestamp() {
		var email = "notifications-paging@example.com";
		var registered = register(email);
		String token = JsonPath.read(registered, "$.accessToken");
		var user = UUID.fromString(JsonPath.read(registered, "$.user.id"));
		verify(token, email);
		var at = java.time.Instant.parse("2026-10-19T08:00:00Z");
		for (var device : java.util.List.of("One", "Two", "Three")) publish(new SignedIn(user, UUID.randomUUID(), device, at));
		publish(new SignedIn(user, UUID.randomUUID(), "Newest", at.plusSeconds(1)));
		await().untilAsserted(() -> assertThat(JsonPath.<Integer>read(list(token), "$.items.length()")).isEqualTo(4));
		var first = client.get().uri("/api/notifications?limit=2").headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		assertThat(JsonPath.<String>read(first, "$.items[0].snapshot.deviceLabel")).isEqualTo("Newest");
		String cursor = JsonPath.read(first, "$.nextCursor");
		var next = client.get().uri("/api/notifications?limit=2&before=" + cursor).headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		var ids = new java.util.ArrayList<String>(JsonPath.read(first, "$.items[*].id"));
		ids.addAll(JsonPath.read(next, "$.items[*].id"));
		assertThat(ids).hasSize(4).doesNotHaveDuplicates();
		assertThat(JsonPath.<Object>read(next, "$.nextCursor")).isNull();
		for (var query : java.util.List.of("limit=0", "limit=101", "before=bad")) {
			client.get().uri("/api/notifications?" + query).headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isBadRequest();
		}
	}

	@Test
	void failedEmailDoesNotLoseTheNotificationOrCauseASecondSend() {
		var email = "notifications-mail-failure@example.com";
		var registered = register(email);
		String token = JsonPath.read(registered, "$.accessToken");
		var user = UUID.fromString(JsonPath.read(registered, "$.user.id"));
		verify(token, email);
		var event = new SignedIn(user, UUID.randomUUID(), "Firefox on Linux", java.time.Instant.now());
		RecordingMailer.failing(true);
		try {
			publish(event);
			await().untilAsserted(() -> assertThat(RecordingMailer.attemptedTo(email)).filteredOn(m -> m.subject().equals("New sign-in to your account")).hasSize(1));
			assertThat(list(token)).contains("Firefox on Linux");
		} finally {
			RecordingMailer.failing(false);
		}
		publish(event);
		await().during(java.time.Duration.ofMillis(300)).untilAsserted(() -> {
			assertThat(JsonPath.<Integer>read(list(token), "$.items.length()")).isEqualTo(1);
			assertThat(RecordingMailer.attemptedTo(email)).filteredOn(m -> m.subject().equals("New sign-in to your account")).hasSize(1);
		});
	}

	@Test
	void unreadCountsAndReadActionsBelongOnlyToTheRecipient() {
		var email = "notifications-read@example.com";
		var registered = register(email);
		String token = JsonPath.read(registered, "$.accessToken");
		var userId = UUID.fromString(JsonPath.read(registered, "$.user.id"));
		verify(token, email);
		publish(new SignedIn(userId, UUID.randomUUID(), "Firefox on Linux", java.time.Instant.now()));
		await().untilAsserted(() -> assertThat(JsonPath.<Integer>read(list(token), "$.items.length()")).isEqualTo(1));
		String id = JsonPath.read(list(token), "$.items[0].id");
		client.get().uri("/api/notifications/unread-count").headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isOk().expectBody().jsonPath("$.count").isEqualTo(1);
		var other = register("notifications-other@example.com");
		String otherToken = JsonPath.read(other, "$.accessToken");
		verify(otherToken, "notifications-other@example.com");
		assertThat(JsonPath.<Integer>read(list(otherToken), "$.items.length()")).isZero();
		client.post().uri("/api/notifications/" + id + "/read").headers(h -> h.setBearerAuth(otherToken))
			.exchange().expectStatus().isNotFound();
		for (int i = 0; i < 2; i++) {
			client.post().uri("/api/notifications/" + id + "/read").headers(h -> h.setBearerAuth(token))
				.exchange().expectStatus().isNoContent();
		}
		assertThat(JsonPath.<Boolean>read(list(token), "$.items[0].read")).isTrue();
		client.get().uri("/api/notifications/unread-count").headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isOk().expectBody().jsonPath("$.count").isEqualTo(0);
		publish(new SignedIn(userId, UUID.randomUUID(), "Chrome on Windows", java.time.Instant.now()));
		await().untilAsserted(() -> assertThat(JsonPath.<Integer>read(list(token), "$.items.length()")).isEqualTo(2));
		client.post().uri("/api/notifications/read-all").headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isNoContent();
		assertThat(JsonPath.<java.util.List<Boolean>>read(list(token), "$.items[*].read")).containsOnly(true);
	}

	@Test
	void aSignInCreatesAnUnreadSnapshotAndEmailsTheUserOnlyOnce() {
		var email = "notifications-snapshot@example.com";
		var registered = register(email);
		String token = JsonPath.read(registered, "$.accessToken");
		var userId = UUID.fromString(JsonPath.read(registered, "$.user.id"));
		verify(token, email);
		var event = new SignedIn(userId, UUID.randomUUID(), "Safari on iPhone", java.time.Instant.parse("2026-10-19T08:00:00Z"));
		publish(event);
		await().untilAsserted(() -> assertThat(list(token)).contains("Safari on iPhone"));
		publish(event);
		await().untilAsserted(() -> assertThat(RecordingMailer.sentTo(email)).filteredOn(m -> m.subject().equals("New sign-in to your account")).hasSize(1));
		var body = list(token);
		assertThat(JsonPath.<Integer>read(body, "$.items.length()")).isEqualTo(1);
		assertThat(JsonPath.<String>read(body, "$.items[0].type")).isEqualTo("SIGNED_IN");
		assertThat(JsonPath.<Boolean>read(body, "$.items[0].read")).isFalse();
		assertThat(JsonPath.<String>read(body, "$.items[0].link")).isEqualTo("/settings/security");
		var mail = RecordingMailer.sentTo(email).getLast();
		assertThat(mail.text()).contains("Safari on iPhone", "19 Oct 2026", "http://localhost:3000/settings/security", "always sent", "settings/notifications");
		assertThat(mail.html()).contains("Review security", "Safari on iPhone");
	}

	String register(String email) {
		return client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Ada", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
	}

	void verify(String token, String email) {
		client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(token))
			.body(Map.of("code", RecordingMailer.lastCodeFor(email))).exchange().expectStatus().isOk();
	}

	String list(String token) {
		return client.get().uri("/api/notifications").headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
	}

	void publish(SignedIn event) {
		transaction.executeWithoutResult(status -> events.publishEvent(event));
	}
}
