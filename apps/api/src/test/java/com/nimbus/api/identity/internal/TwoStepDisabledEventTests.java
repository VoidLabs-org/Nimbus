package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.SignInCodes;
import com.nimbus.api.identity.TwoStepDisabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Notifications turns this event into a Security alert, so it must come once per Remove and say only who and when. */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class, TwoStepDisabledEventTests.Listener.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class TwoStepDisabledEventTests {

	@Autowired
	RestTestClient client;

	@Autowired
	ExternalSignIn externalSignIn;

	@Autowired
	Sessions sessions;

	@Autowired
	AccessTokens accessTokens;

	@Autowired
	MovableClock clock;

	@Autowired
	Listener listener;

	@Test
	void removingItPublishesTwoStepDisabledOnce() {
		var email = "tsd1@example.com";
		var user = externalSignIn.signIn(new ExternalProfile("google", "g-" + email, email, true, "Someone", null, email));
		var token = accessTokens.issueFor(user, sessions.start(user, null).sessionId());
		String key = JsonPath.read(client.post().uri("/api/users/me/two-step/setup").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.key");
		List<String> codes = JsonPath.read(client.post().uri("/api/users/me/two-step/setup/verify")
			.header("Authorization", "Bearer " + token).body(Map.of("code", SignInCodes.codeFor(key, clock.instant())))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody(), "$.recoveryCodes");
		client.post().uri("/api/users/me/two-step").header("Authorization", "Bearer " + token).exchange().expectStatus()
			.isNoContent();
		var userId = user.getId().toString();

		remove(token, Map.of("recoveryCode", "aaaa-aaaa")).expectStatus().isBadRequest();
		assertThat(listener.about(userId)).isEmpty();
		remove(token, Map.of("recoveryCode", codes.getFirst())).expectStatus().isNoContent();
		clock.advance(Duration.ofSeconds(30));
		remove(token, Map.of("code", SignInCodes.codeFor(key, clock.instant()))).expectStatus().isEqualTo(409);

		var published = listener.about(userId);
		assertThat(published).hasSize(1);
		assertThat(published.getFirst().occurredAt()).isNotNull();
		assertThat(published.getFirst().toString()).doesNotContain(codes.getFirst());
	}

	private RestTestClient.ResponseSpec remove(String token, Map<String, String> body) {
		return client.method(HttpMethod.DELETE).uri("/api/users/me/two-step").header("Authorization", "Bearer " + token)
			.body(body).exchange();
	}

	@TestConfiguration
	static class Listener {

		private final List<TwoStepDisabled> received = new CopyOnWriteArrayList<>();

		@EventListener
		void on(TwoStepDisabled event) {
			received.add(event);
		}

		List<TwoStepDisabled> about(String userId) {
			return received.stream().filter(event -> event.userId().toString().equals(userId)).toList();
		}

	}

}
