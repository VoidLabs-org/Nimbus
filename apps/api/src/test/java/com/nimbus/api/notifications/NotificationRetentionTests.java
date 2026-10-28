package com.nimbus.api.notifications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
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

@Import({TestcontainersConfiguration.class, MovableClock.Configuration.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
	properties = "nimbus.notifications.cleanup-cron=* * * * * *")
@AutoConfigureRestTestClient
class NotificationRetentionTests {
	@Autowired RestTestClient client;
	@Autowired MovableClock clock;

	@Test
	void cleanupRemovesNotificationsOlderThanNinetyDaysAndKeepsRecentOnes() {
		var email = "notification-retention@example.com";
		String registered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Ada", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registered, "$.accessToken");
		client.post().uri("/api/auth/verify-email").headers(h -> h.setBearerAuth(token))
			.body(Map.of("code", RecordingMailer.lastCodeFor(email))).exchange().expectStatus().isOk();
		var first = login(email, "Mozilla/5.0 Firefox/132.0");
		await().untilAsserted(() -> assertThat(list(first)).contains("Firefox"));
		clock.advance(Duration.ofDays(91));
		var recent = login(email, "Mozilla/5.0 Chrome/130.0.0.0");
		await().untilAsserted(() -> assertThat(list(recent)).contains("Chrome").doesNotContain("Firefox"));
	}

	private String login(String email, String agent) {
		String body = client.post().uri("/api/auth/login").header("User-Agent", agent)
			.body(Map.of("email", email, "password", "correct horse"))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.accessToken");
	}

	private String list(String token) {
		return client.get().uri("/api/notifications").headers(h -> h.setBearerAuth(token))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
	}
}
