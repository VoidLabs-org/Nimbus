package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.RecordingMailer;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.projects.MemberRemoved;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.Scenario;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import({ TestcontainersConfiguration.class, RecordingMailer.class, MemberRemovedUnassignsTests.Collecting.class })
@ApplicationModuleTest(mode = ApplicationModuleTest.BootstrapMode.ALL_DEPENDENCIES)
@AutoConfigureRestTestClient
class MemberRemovedUnassignsTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	IssueChangedCollector collector;

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
		for (var title : new String[] { "Assigned", "Reported", "Assigned too", "Elsewhere" }) {
			var key = title.equals("Elsewhere") ? "MRO" : "MRU";
			client.post().uri("/api/projects/" + key + "/issues").header("Authorization", "Bearer " + token)
				.body(Map.of("type", "Story", "title", title)).exchange().expectStatus().isCreated();
		}
		// MRU-1 and MRU-3 assigned to the leaver, MRU-2 reported by the leaver (assigned to nobody), MRO-1 elsewhere.
		setAssignee("MRU", 1, leaver.id());
		setAssignee("MRU", 3, leaver.id());
		jdbc.sql("UPDATE issues SET reporter_id = :user WHERE project_id = :p AND number = 2")
			.param("user", leaver.id()).param("p", project).update();
		setAssignee("MRO", 1, leaver.id());

		collector.events.clear();
		scenario.publish(new MemberRemoved(project, leaver.id()))
			.andWaitForStateChange(() -> collector.events.size(), n -> n >= 2).andVerify(n -> {
				var events = collector.events.stream().sorted(Comparator.comparing(IssueChanged::issueKey)).toList();
				assertThat(events).extracting(IssueChanged::issueKey).containsExactly("MRU-1", "MRU-3");
				assertThat(events).extracting(IssueChanged::title).containsExactly("Assigned", "Assigned too");
				assertThat(events).allSatisfy(changed -> {
					assertThat(changed.projectId()).isEqualTo(project);
					assertThat(changed.actorId()).isNull();
					assertThat(changed.systemMade()).isTrue();
					assertThat(changed.assigneeId()).isNull();
					assertThat(changed.changes()).containsExactly(
							new IssueChanged.Change("assignee", leaver.id().toString(), null));
				});
			});

		assertThat(assignee("MRU", 1)).isNull();
		assertThat(assignee("MRU", 3)).isNull();
		assertThat(assignee("MRO", 1)).isEqualTo(leaver.id());
		assertThat(jdbc.sql("""
				SELECT count(*) FROM issue_history h JOIN issues i ON i.id = h.issue_id
				WHERE h.field = 'assignee' AND h.actor_id IS NULL AND h.before_value = :user AND h.after_value IS NULL
				AND i.project_id = :p AND i.number IN (1, 3)""").param("user", leaver.id().toString()).param("p", project)
			.query(Long.class).single()).isEqualTo(2L);
		// Only MRU-1 and MRU-3 were touched: none for the Issue the leaver merely reported, none in the other project.
		assertThat(jdbc.sql("""
				SELECT count(*) FROM issue_history h JOIN issues i ON i.id = h.issue_id
				WHERE h.field = 'assignee' AND i.project_id IN (:p, :o)""").param("p", project).param("o", other)
			.query(Long.class).single()).isEqualTo(2L);
	}

	@TestConfiguration
	static class Collecting {

		@Bean
		IssueChangedCollector issueChangedCollector() {
			return new IssueChangedCollector();
		}
	}

	static class IssueChangedCollector {

		final List<IssueChanged> events = new CopyOnWriteArrayList<>();

		@EventListener
		void on(IssueChanged event) {
			events.add(event);
		}
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
