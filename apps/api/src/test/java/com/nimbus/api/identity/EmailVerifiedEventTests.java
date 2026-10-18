package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.RecordingMailer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.test.web.servlet.client.RestTestClient;

/**
 * {@code PublishedEvents} needs a module test, which runs without the security filters, so this signed-in flow
 * listens for the event itself.
 */
@Import({ TestcontainersConfiguration.class, EmailVerifiedEventTests.Listener.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class EmailVerifiedEventTests {

	@Autowired
	RestTestClient client;

	@Autowired
	Listener listener;

	@Test
	void enteringTheRightCodePublishesEmailVerifiedOnce() {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Lena", "email", "ev-lena@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		String id = JsonPath.read(response, "$.user.id");
		assertThat(listener.about("ev-lena@example.com")).isEmpty();

		for (var attempt = 0; attempt < 2; attempt++) {
			client.post().uri("/api/auth/verify-email").header("Authorization", "Bearer " + token)
				.body(Map.of("code", RecordingMailer.lastCodeFor("ev-lena@example.com")))
				.exchange().expectStatus().isOk();
		}

		assertThat(listener.about("ev-lena@example.com")).hasSize(1);
		assertThat(listener.about("ev-lena@example.com").get(0).userId().toString()).isEqualTo(id);
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class Listener {

		private final List<EmailVerified> seen = new CopyOnWriteArrayList<>();

		@EventListener
		void on(EmailVerified event) {
			seen.add(event);
		}

		List<EmailVerified> about(String email) {
			return seen.stream().filter(event -> event.email().equals(email)).toList();
		}

	}

}
