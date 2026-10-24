package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.test.web.servlet.client.RestTestClient;

/** As in {@link EmailVerifiedEventTests}, this signed-in flow listens for the event itself. */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class, EmailChangedEventTests.Listener.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class EmailChangedEventTests {

	@Autowired
	RestTestClient client;

	@Autowired
	Listener listener;

	@Autowired
	MovableClock clock;

	@Test
	void enteringTheRightCodePublishesEmailChangedOnceWithoutTheCodeOrTheOldEmail() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Nadia", "email", "ece-old@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		String id = JsonPath.read(response, "$.user.id");
		EmailCodes.verify(client, token, "ece-old@example.com");

		client.post().uri("/api/users/me/email-change").header("Authorization", "Bearer " + token)
			.body(Map.of("email", "ece-new@example.com"))
			.exchange().expectStatus().isNoContent();
		var code = RecordingMailer.lastCodeFor("ece-new@example.com");
		assertThat(listener.about(id)).isEmpty();

		var before = clock.instant();
		client.post().uri("/api/users/me/email-change/confirm").header("Authorization", "Bearer " + token)
			.body(Map.of("code", code))
			.exchange().expectStatus().isOk();
		client.post().uri("/api/users/me/email-change/confirm").header("Authorization", "Bearer " + token)
			.body(Map.of("code", code))
			.exchange().expectStatus().isBadRequest();

		assertThat(listener.about(id)).singleElement().satisfies(event -> {
			assertThat(event.newEmail()).isEqualTo("ece-new@example.com");
			assertThat(event.occurredAt()).isEqualTo(before);
			assertThat(event.toString()).doesNotContain(code).doesNotContain("ece-old");
		});
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class Listener {

		private final List<EmailChanged> seen = new CopyOnWriteArrayList<>();

		@EventListener
		void on(EmailChanged event) {
			seen.add(event);
		}

		List<EmailChanged> about(String userId) {
			return seen.stream().filter(event -> event.userId().toString().equals(userId)).toList();
		}

	}

}
