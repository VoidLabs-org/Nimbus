package com.nimbus.api.issues;

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
class IssueDeletedEventTests {

	@Autowired
	RestTestClient client;

	@Autowired
	org.springframework.jdbc.core.simple.JdbcClient jdbc;

	@AfterEach
	void clearCaller() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void deletingPublishesOnceAndRefusedDeletesPublishNothing(PublishedEvents events) {
		var registration = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", "Dana", "email", "issue-deleted@example.com", "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(registration, "$.accessToken");
		UUID creator = UUID.fromString(JsonPath.read(registration, "$.user.id"));
		// Module tests use mock HTTP without security filters: supply the caller at the authentication boundary.
		SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
				Jwt.withTokenValue(token).header("alg", "HS256").subject(creator.toString()).build()));
		var project = client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", "idl", "name", "Issue deletes"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		UUID projectId = UUID.fromString(JsonPath.read(project, "$.id"));
		IssueRoles.give(jdbc, JsonPath.read(project, "$.key"), creator.toString(), "project_admin");
		client.post().uri("/api/projects/IDL/issues").header("Authorization", "Bearer " + token)
			.body(Map.of("type", "Story", "title", "Gone")).exchange().expectStatus().isCreated();

		client.delete().uri("/api/issues/IDL-9").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNotFound();
		assertThat(events.ofType(IssueDeleted.class)).isEmpty();

		client.delete().uri("/api/issues/IDL-1").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNoContent();
		client.delete().uri("/api/issues/IDL-1").header("Authorization", "Bearer " + token).exchange()
			.expectStatus().isNotFound();

		assertThat(events.ofType(IssueDeleted.class)).hasSize(1)
			.first().isEqualTo(new IssueDeleted(projectId, "IDL-1"));
	}
}
