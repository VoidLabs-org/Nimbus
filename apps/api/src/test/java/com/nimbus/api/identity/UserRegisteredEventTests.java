package com.nimbus.api.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.RecordingMailer;
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
class UserRegisteredEventTests {

	@Autowired
	RestTestClient client;

	@Test
	void registeringAUserPublishesUserRegistered(PublishedEvents events) {
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Eve", "email", "Eve@Example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String id = JsonPath.read(response, "$.user.id");

		var published = events.ofType(UserRegistered.class).matching(event -> event.email().equals("eve@example.com"));
		assertThat(published).hasSize(1);
		var event = published.iterator().next();
		assertThat(event.userId().toString()).isEqualTo(id);
		assertThat(event.displayName()).isEqualTo("Eve");
	}

	@Test
	void signingInDoesNotPublishUserRegistered(PublishedEvents events) {
		client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Finn", "email", "finn@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isCreated();
		var registrations = events.ofType(UserRegistered.class).matching(event -> event.email().equals("finn@example.com"));
		assertThat(registrations).hasSize(1);

		client.post().uri("/api/auth/login")
			.body(Map.of("email", "finn@example.com", "password", "correct horse"))
			.exchange()
			.expectStatus().isOk();

		assertThat(events.ofType(UserRegistered.class).matching(event -> event.email().equals("finn@example.com")))
			.hasSize(1);
	}

}
