package com.nimbus.api.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.MovableClock;
import com.nimbus.api.identity.SignInCodes;
import com.nimbus.api.identity.TwoStepEnabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.test.web.servlet.client.RestTestClient;

/** Notifications turns this event into a Security alert, so it must come once per turn-on and say only who and when. */
@Import({ TestcontainersConfiguration.class, MovableClock.Configuration.class, TwoStepEnabledEventTests.Listener.class })
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class TwoStepEnabledEventTests {

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
	void turningItOnPublishesTwoStepEnabledOnce() {
		var email = "tse1@example.com";
		var user = externalSignIn.signIn(new ExternalProfile("google", "g-" + email, email, true, "Someone", null, email));
		var token = accessTokens.issueFor(user, sessions.start(user, null).sessionId());

		String key = JsonPath.read(post(token, "/setup", null).expectStatus().isOk().expectBody(String.class)
			.returnResult().getResponseBody(), "$.key");
		assertThat(listener.about(user.getId().toString())).isEmpty();
		post(token, "/setup/verify", Map.of("code", SignInCodes.codeFor(key, clock.instant()))).expectStatus().isOk();
		assertThat(listener.about(user.getId().toString())).isEmpty();
		post(token, "", null).expectStatus().isNoContent();
		post(token, "", null).expectStatus().isEqualTo(409);

		var published = listener.about(user.getId().toString());
		assertThat(published).hasSize(1);
		assertThat(published.get(0).occurredAt()).isNotNull();
	}

	private RestTestClient.ResponseSpec post(String token, String path, Object body) {
		var request = client.post().uri("/api/users/me/two-step" + path).header("Authorization", "Bearer " + token);
		return (body == null ? request : request.body(body)).exchange();
	}

	@TestConfiguration
	static class Listener {

		private final List<TwoStepEnabled> received = new CopyOnWriteArrayList<>();

		@EventListener
		void on(TwoStepEnabled event) {
			received.add(event);
		}

		List<TwoStepEnabled> about(String userId) {
			return received.stream().filter(event -> event.userId().toString().equals(userId)).toList();
		}

	}

}
