package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import com.jayway.jsonpath.JsonPath;
import com.nimbus.api.TestcontainersConfiguration;
import com.nimbus.api.identity.EmailCodes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureRestTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.client.RestTestClient;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class DeleteIssueTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void aMemberDeletesAnIssueAndItsHistoryAndADeletionRecordIsKept() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key, "Doomed");

		delete(dana, issue).expectStatus().isNoContent();

		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectStatus().isNotFound();
		client.get().uri("/api/issues/{key}/history", issue).header("Authorization", "Bearer " + dana.token())
			.exchange().expectStatus().isNotFound();
		assertThat(jdbc.sql("SELECT count(*) FROM issue_history h WHERE NOT EXISTS (SELECT 1 FROM issues i WHERE i.id = h.issue_id)")
			.query(Long.class).single()).isZero();
		var record = jdbc.sql("""
				SELECT d.issue_key, d.title, d.actor_id FROM issue_deletions d
				JOIN projects p ON p.id = d.project_id WHERE p.key = :key
				""").param("key", key).query((row, i) -> Map.of("key", row.getString("issue_key"),
						"title", row.getString("title"), "actor", row.getObject("actor_id", UUID.class).toString()))
			.single();
		assertThat(record).containsEntry("key", issue).containsEntry("title", "Doomed")
			.containsEntry("actor", dana.id());
	}

	@Test
	void theDeletedNumberIsNeverUsedAgain() {
		var dana = register("Dana");
		var key = project(dana);
		createIssue(dana, key, "One");
		var second = createIssue(dana, key, "Two");
		delete(dana, second).expectStatus().isNoContent();

		assertThat(createIssue(dana, key, "Three")).isEqualTo(key + "-3");
	}

	@Test
	void anAlreadyDeletedKeyAndNonMembersGetNotFoundAndAnArchivedProjectRefusesWith409() {
		var dana = register("Dana");
		var eve = register("Eve");
		var key = project(dana);
		var issue = createIssue(dana, key, "Keep");

		delete(eve, issue).expectStatus().isNotFound();
		client.delete().uri("/api/issues/{key}", issue).exchange().expectStatus().isUnauthorized();
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", key).update();
		delete(dana, issue).expectStatus().isEqualTo(409);
		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectStatus().isOk();
		jdbc.sql("UPDATE projects SET archived_at = NULL WHERE key = :key").param("key", key).update();

		delete(dana, issue).expectStatus().isNoContent();
		delete(dana, issue).expectStatus().isNotFound();
		delete(dana, "nonsense").expectStatus().isNotFound();
	}

	private RestTestClient.ResponseSpec delete(Person who, String issueKey) {
		return client.delete().uri("/api/issues/{key}", issueKey).header("Authorization", "Bearer " + who.token())
			.exchange();
	}

	private String createIssue(Person who, String projectKey, String title) {
		var body = client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("type", "Story", "title", title))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.key");
	}

	private String project(Person owner) {
		var key = "D" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
			.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + owner.token())
			.body(Map.of("key", key, "name", "Project " + key)).exchange().expectStatus().isCreated();
		return key;
	}

	private Person register(String name) {
		var email = UUID.randomUUID() + "@example.com";
		var response = client.post().uri("/api/auth/register")
			.body(Map.of("displayName", name, "email", email, "password", "correct horse"))
			.exchange().expectStatus().isCreated()
			.expectBody(String.class).returnResult().getResponseBody();
		String token = JsonPath.read(response, "$.accessToken");
		EmailCodes.verify(client, token, email);
		return new Person(token, JsonPath.read(response, "$.user.id"));
	}
}
