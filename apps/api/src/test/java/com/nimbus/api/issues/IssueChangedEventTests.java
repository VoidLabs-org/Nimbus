package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
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
class IssueChangedEventTests {

	@Autowired
	RestTestClient client;

	@Autowired
	org.springframework.jdbc.core.simple.JdbcClient jdbc;

	@AfterEach
	void clearCaller() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void anEditPublishesOnceWithTheChangedFieldsAndRefusedOrUnchangedEditsPublishNothing(PublishedEvents events) {
		var email = "issue-changed@example.com";
		var registration = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registration, "$.accessToken");
		UUID creator = UUID.fromString(JsonPath.read(registration, "$.user.id"));
		// Module tests use mock HTTP without security filters: supply the caller at the authentication boundary.
		SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
				Jwt.withTokenValue(token).header("alg", "HS256").subject(creator.toString()).build()));
		var project = client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "ich", "name", "Issue changes"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		UUID projectId = UUID.fromString(JsonPath.read(project, "$.id"));
		IssueRoles.give(jdbc, JsonPath.read(project, "$.key"), creator.toString(), "project_admin");
		client.post().uri("/api/projects/ICH/issues").header("Authorization", "Bearer " + token)
			.body(Map.of("type", "Story", "title", "Before")).exchange().expectStatus().isCreated();

		client.patch().uri("/api/issues/ICH-1").header("Authorization", "Bearer " + token)
			.body(Map.of("title", "After", "priority", "High", "version", 0)).exchange().expectStatus().isOk();
		// Stale, invalid and unchanged edits publish nothing.
		client.patch().uri("/api/issues/ICH-1").header("Authorization", "Bearer " + token)
			.body(Map.of("title", "Stale", "version", 0)).exchange().expectStatus().isEqualTo(409);
		client.patch().uri("/api/issues/ICH-1").header("Authorization", "Bearer " + token)
			.body(Map.of("type", "Epic")).exchange().expectStatus().isBadRequest();
		client.patch().uri("/api/issues/ICH-1").header("Authorization", "Bearer " + token)
			.body(Map.of("priority", "High")).exchange().expectStatus().isOk();

		var published = events.ofType(IssueChanged.class);
		assertThat(published).hasSize(1);
		assertThat(published.iterator().next())
			.isEqualTo(new IssueChanged(projectId, "ICH-1", List.of("title", "priority")));

		// A move publishes once with "status"; moving to the Status it is already in publishes nothing.
		var statuses = client.get().uri("/api/projects/ICH/statuses").header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isOk().expectBody(String.class).returnResult().getResponseBody();
		String done = ((List<String>) JsonPath.read(statuses, "$[?(@.name=='Done')].id")).getFirst();
		client.put().uri("/api/issues/ICH-1/status").header("Authorization", "Bearer " + token)
			.body(Map.of("statusId", done)).exchange().expectStatus().isOk();
		client.put().uri("/api/issues/ICH-1/status").header("Authorization", "Bearer " + token)
			.body(Map.of("statusId", done)).exchange().expectStatus().isOk();
		assertThat(events.ofType(IssueChanged.class)).hasSize(2)
			.last().isEqualTo(new IssueChanged(projectId, "ICH-1", List.of("status")));

		// Deleting a Status publishes once for each Issue it moves, and nothing when a refused delete moves none.
		var review = client.post().uri("/api/projects/ICH/statuses").header("Authorization", "Bearer " + token)
			.body(Map.of("name", "Review", "category", "IN_PROGRESS")).exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String reviewId = JsonPath.read(review, "$.id");
		client.put().uri("/api/issues/ICH-1/status").header("Authorization", "Bearer " + token)
			.body(Map.of("statusId", reviewId)).exchange().expectStatus().isOk();
		client.delete().uri("/api/projects/ICH/statuses/{id}", reviewId).header("Authorization", "Bearer " + token)
			.exchange().expectStatus().isBadRequest();
		assertThat(events.ofType(IssueChanged.class)).hasSize(3);
		client.delete().uri("/api/projects/ICH/statuses/{id}?moveTo={to}", reviewId, done)
			.header("Authorization", "Bearer " + token).exchange().expectStatus().isNoContent();
		assertThat(events.ofType(IssueChanged.class)).hasSize(4)
			.last().isEqualTo(new IssueChanged(projectId, "ICH-1", List.of("status")));
	}
}
