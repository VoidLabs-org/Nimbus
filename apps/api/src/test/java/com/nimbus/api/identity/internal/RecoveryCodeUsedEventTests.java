package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.RecoveryCodeUsed;
import com.nimbus.api.identity.SignInCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Notifications turns this event into a Security alert: once per code used, saying who, when and how many are left. */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class, RecoveryCodeUsedEventTests.Listener.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class RecoveryCodeUsedEventTests {

	@Autowired
	RestTestClient client;

	@Autowired
	MovableClock clock;

	@Autowired
	Listener listener;

	@Test
	void signingInWithARecoveryCodePublishesRecoveryCodeUsedOnceWithNoCode() {
		var email = "rcu1@example.com";
		String token = JsonPath.read(client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Someone", "email", email, "password", "correct horse")).exchange()
			.expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody(), "$.accessToken");
		EmailCodes.verify(client, token, email);
		String key = JsonPath.read(post(token, "/setup").exchange().expectStatus().isOk().expectBody(String.class)
			.returnResult().getResponseBody(), "$.key");
		List<String> codes = JsonPath.read(post(token, "/setup/verify")
			.body(Map.of("code", SignInCodes.codeFor(key, clock.instant()))).exchange().expectStatus().isOk()
			.expectBody(String.class).returnResult().getResponseBody(), "$.recoveryCodes");
		post(token, "").exchange().expectStatus().isNoContent();
		clock.advance(Duration.ofSeconds(30));
		String userId = JsonPath.read(client.get().uri("/api/users/me").header("Authorization", "Bearer " + token)
			.exchange().expectBody(String.class).returnResult().getResponseBody(), "$.id");

		recoveryCode(email, "zzzz-zzzz").expectStatus().isBadRequest();
		assertThat(listener.about(userId)).isEmpty();
		recoveryCode(email, codes.getFirst()).expectStatus().isOk();
		recoveryCode(email, codes.getFirst()).expectStatus().isBadRequest();

		var published = listener.about(userId);
		assertThat(published).hasSize(1);
		assertThat(published.getFirst().occurredAt()).isNotNull();
		assertThat(published.getFirst().codesLeft()).isEqualTo(9);
		assertThat(published.getFirst().toString()).doesNotContain(codes.getFirst())
			.doesNotContain(codes.getFirst().replace("-", ""));
	}

	private RestTestClient.RequestBodySpec post(String token, String path) {
		return client.post().uri("/api/users/me/two-step" + path).header("Authorization", "Bearer " + token);
	}

	private RestTestClient.ResponseSpec recoveryCode(String email, String code) {
		var header = client.post().uri("/api/auth/login").body(Map.of("email", email, "password", "correct horse"))
			.exchange().expectBody(String.class).returnResult().getResponseHeaders()
			.getOrEmpty(HttpHeaders.SET_COOKIE).stream()
			.filter(cookie -> cookie.startsWith("two_step_pending="))
			.findFirst().orElseThrow();
		var pending = header.substring("two_step_pending=".length(), header.indexOf(';'));
		return client.post().uri("/api/auth/two-step").header("X-Requested-With", "nimbus")
			.cookie("two_step_pending", pending).body(Map.of("recoveryCode", code)).exchange();
	}

	@TestConfiguration
	static class Listener {

		private final List<RecoveryCodeUsed> received = new CopyOnWriteArrayList<>();

		@EventListener
		void on(RecoveryCodeUsed event) {
			received.add(event);
		}

		List<RecoveryCodeUsed> about(String userId) {
			return received.stream().filter(event -> event.userId().toString().equals(userId)).toList();
		}

	}

}
