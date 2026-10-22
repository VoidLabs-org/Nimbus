package com.nimbus.api.projects;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.PublishedEvents;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import({ TestcontainersConfiguration.class, RecordingMailer.class })
@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.ALL_DEPENDENCIES)
@AutoConfigureRestTestClient
class ProjectCreatedEventTests {

	@Autowired
	RestTestClient client;

	@Autowired
	Projects projects;

	@AfterEach
	void clearCaller() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void creatingPublishesOnceWithTheProjectAndCreatorAndReadingPublishesNothing(PublishedEvents events) {
		var email = "project-events@example.com";
		var registration = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registration, "$.accessToken");
		UUID creator = UUID.fromString(JsonPath.read(registration, "$.user.id"));
		// Module tests use mock HTTP without security filters. Supply the caller at the authentication boundary;
		// the full HTTP tests separately exercise real tokens and email verification.
		SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
				Jwt.withTokenValue(token).header("alg", "HS256").subject(creator.toString()).build()));
		var response = client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "evt", "name", "Event project"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		UUID id = UUID.fromString(JsonPath.read(response, "$.id"));

		var published = events.ofType(ProjectCreated.class);
		assertThat(published).hasSize(1);
		assertThat(published.iterator().next()).isEqualTo(new ProjectCreated(id, "EVT", creator));
		// Other modules can resolve the new project and its first Member through the public interface.
		assertThat(projects.findById(id)).contains(new ProjectSummary(id, "EVT", "Event project", false));
		assertThat(projects.findByKey("evt")).isEqualTo(projects.findById(id));
		assertThat(projects.isMember(id, creator)).isTrue();
		assertThat(projects.isMember(id, UUID.randomUUID())).isFalse();
		assertThat(projects.findById(UUID.randomUUID())).isEmpty();
		assertThat(projects.findByKey("MISSING")).isEmpty();

		client.get().uri("/api/projects/EVT").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk();
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "EVT", "name", "Duplicate"))
			.exchange().expectStatus().isEqualTo(409);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "BAD-KEY", "name", "Invalid"))
			.exchange().expectStatus().isBadRequest();
		assertThat(events.ofType(ProjectCreated.class)).hasSize(1);
	}
}
