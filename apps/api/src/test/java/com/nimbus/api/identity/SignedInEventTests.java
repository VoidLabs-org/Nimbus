package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.PublishedEvents;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import({ TestcontainersConfiguration.class, RecordingMailer.class })
// With storage, which identity uses for Profile pictures; mail is stood in for by RecordingMailer.
@ApplicationModuleTest(extraIncludes = "storage")
@AutoConfigureRestTestClient
class SignedInEventTests {

	@Autowired RestTestClient client;

	@Test
	void onlyANewSignInPublishesAnEventNotRegistrationOrRefresh(PublishedEvents events) {
		var registered = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Ada", "email", "signin-event@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult();
		var id = UUID.fromString(JsonPath.read(registered.getResponseBody(), "$.user.id"));
		assertThat(events.ofType(SignedIn.class).matching(e -> e.userId().equals(id))).isEmpty();

		var login = client.post().uri("/api/auth/login").header("User-Agent", SessionListTests.CHROME_ON_WINDOWS)
			.body(Map.of("email", "signin-event@example.com", "password", "correct horse"))
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult();
		assertThat(events.ofType(SignedIn.class).matching(e -> e.userId().equals(id))).singleElement().satisfies(e -> {
			assertThat(e.deviceLabel()).isEqualTo("Chrome on Windows");
			assertThat(e.sessionId()).isNotNull();
			assertThat(e.at()).isNotNull();
		});

		client.post().uri("/api/auth/refresh").header("X-Requested-With", "nimbus")
			.cookie("refresh_token", RefreshCookies.of(login).getValue()).exchange().expectStatus().isOk();
		assertThat(events.ofType(SignedIn.class).matching(e -> e.userId().equals(id))).hasSize(1);
	}
}
