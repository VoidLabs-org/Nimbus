package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.projects.MemberRemoved;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.Scenario;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import({ TestcontainersConfiguration.class, RecordingMailer.class })
@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.ALL_DEPENDENCIES)
@AutoConfigureRestTestClient
class MemberRemovedUnassignsTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	@AfterEach
	void clearCaller() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void removingAMemberUnassignsTheirIssuesInThatProjectOnlyWithHistoryAndAnEvent(Scenario scenario) {
		var owner = register("unassign-owner@example.com", "Owner");
		var leaver = register("unassign-leaver@example.com", "Leaver");
		var token = owner.token();
		SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(
				Jwt.withTokenValue(token).header("alg", "HS256").subject(owner.id().toString()).build()));
		var project = createProject(token, "mru", "Unassign");
		var other = createProject(token, "mro", "Unassign other");
		for (var title : new String[] { "Assigned", "Reported", "Elsewhere" }) {
			var key = title.equals("Elsewhere") ? "MRO" : "MRU";
			client.post().uri("/api/projects/" + key + "/issues").header("Authorization", "Bearer " + token)
				.body(Map.of("type", "Story", "title", title)).exchange().expectStatus().isCreated();
		}
		// MRU-1 assigned to the leaver, MRU-2 reported by the leaver (assigned to nobody), MRO-1 assigned elsewhere.
		setAssignee("MRU", 1, leaver.id());
		jdbc.sql("UPDATE issues SET reporter_id = :user WHERE project_id = :p AND number = 2")
			.param("user", leaver.id()).param("p", project).update();
		setAssignee("MRO", 1, leaver.id());

		scenario.publish(new MemberRemoved(project, leaver.id())).andWaitForEventOfType(IssueChanged.class)
			.toArriveAndVerify(changed -> {
				assertThat(changed.projectId()).isEqualTo(project);
				assertThat(changed.issueKey()).isEqualTo("MRU-1");
				assertThat(changed.actorId()).isNull();
				assertThat(changed.assigneeId()).isNull();
				assertThat(changed.title()).isEqualTo("Assigned");
				assertThat(changed.changes()).containsExactly(
						new IssueChanged.Change("assignee", leaver.id().toString(), null));
			});

		assertThat(assignee("MRU", 1)).isNull();
		assertThat(assignee("MRO", 1)).isEqualTo(leaver.id());
		assertThat(jdbc.sql("""
				SELECT count(*) FROM issue_history h JOIN issues i ON i.id = h.issue_id
				WHERE h.field = 'assignee' AND h.actor_id IS NULL AND h.before_value = :user AND h.after_value IS NULL
				AND i.project_id = :p AND i.number = 1""").param("user", leaver.id().toString()).param("p", project)
			.query(Long.class).single()).isEqualTo(1L);
		// Only MRU-1 was touched: no entry for the Issue the leaver merely reported, none in the other project.
		assertThat(jdbc.sql("""
				SELECT count(*) FROM issue_history h JOIN issues i ON i.id = h.issue_id
				WHERE h.field = 'assignee' AND i.project_id IN (:p, :o)""").param("p", project).param("o", other)
			.query(Long.class).single()).isEqualTo(1L);
	}

	private record Person(UUID id, String token) {
	}

	private Person register(String email, String name) {
		var body = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return new Person(UUID.fromString(JsonPath.read(body, "$.user.id")), JsonPath.read(body, "$.accessToken"));
	}

	private UUID createProject(String token, String key, String name) {
		var body = client.post().uri("/api/projects").header("Authorization", "Bearer " + token)
			.body(Map.of("key", key, "name", name)).exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		return UUID.fromString(JsonPath.read(body, "$.id"));
	}

	private void setAssignee(String projectKey, int number, UUID user) {
		jdbc.sql("""
				UPDATE issues SET assignee_id = :user WHERE number = :n
				AND project_id = (SELECT id FROM projects WHERE key = :key)""")
			.param("user", user).param("n", number).param("key", projectKey).update();
	}

	private UUID assignee(String projectKey, int number) {
		return jdbc.sql("""
				SELECT assignee_id FROM issues WHERE number = :n
				AND project_id = (SELECT id FROM projects WHERE key = :key)""")
			.param("n", number).param("key", projectKey).query(UUID.class).optional().orElse(null);
	}
}
