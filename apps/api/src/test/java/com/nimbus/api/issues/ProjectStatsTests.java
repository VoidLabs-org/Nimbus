package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
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

/**
 * {@code GET /api/issues/stats}: each of the User's projects with its Issue totals, for the Projects table, in one
 * request. Every User here is new, so their list holds only what the test makes.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class ProjectStatsTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void eachProjectHasItsTotalAndHowManyAreDoneInTheProjectsListOrder() {
		var dana = register("Dana");
		var busy = project(dana, "Apollo");
		var quiet = project(dana, "Zephyr");
		create(dana, busy, "First");
		create(dana, busy, "Second");
		create(dana, busy, "Third");
		move(busy, 2, "Done");

		var body = stats(dana);
		assertThat((List<String>) JsonPath.read(body, "$[*].projectKey")).containsExactly(busy, quiet);
		assertThat((Integer) JsonPath.read(body, "$[0].total")).isEqualTo(3);
		assertThat((Integer) JsonPath.read(body, "$[0].done")).isEqualTo(1);
		assertThat((String) JsonPath.read(body, "$[0].updatedAt")).isNotNull();
		// A project with no Issues is still listed, with zeros and nothing updated yet.
		assertThat((Integer) JsonPath.read(body, "$[1].total")).isZero();
		assertThat((Integer) JsonPath.read(body, "$[1].done")).isZero();
		assertThat((Object) JsonPath.read(body, "$[1].updatedAt")).isNull();
	}

	@Test
	void aDeletionCountsAsTheProjectsLatestChange() {
		var dana = register("Dana");
		var key = project(dana, "Deleting");
		create(dana, key, "Gone soon");
		// Made old, so the deletion is clearly the later of the two.
		jdbc.sql("UPDATE issues SET updated_at = now() - interval '1 day' WHERE project_id = (SELECT id FROM projects WHERE key = :key)")
			.param("key", key).update();
		var before = (String) JsonPath.read(stats(dana), "$[0].updatedAt");

		client.delete().uri("/api/issues/{key}", key + "-1").header("Authorization", "Bearer " + dana.token())
			.exchange().expectStatus().isNoContent();

		var body = stats(dana);
		assertThat((Integer) JsonPath.read(body, "$[0].total")).isZero();
		assertThat((String) JsonPath.read(body, "$[0].updatedAt")).isGreaterThan(before);
	}

	@Test
	void onlyTheUsersOwnActiveProjectsAreListed() {
		var dana = register("Dana");
		var eve = register("Eve");
		var danas = project(dana, "Dana's");
		var archived = project(dana, "Archived");
		project(eve, "Eve's");
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", archived).update();

		assertThat((List<String>) JsonPath.read(stats(dana), "$[*].projectKey")).containsExactly(danas);
	}

	@Test
	void aUserWithNoProjectsGetsAnEmptyList() {
		assertThat((List<?>) JsonPath.read(stats(register("Newcomer")), "$")).isEmpty();
	}

	@Test
	void signingInIsRequired() {
		client.get().uri("/api/issues/stats").exchange().expectStatus().isUnauthorized();
	}

	private String stats(Person who) {
		return new String(client.get().uri("/api/issues/stats").header("Authorization", "Bearer " + who.token())
			.exchange().expectStatus().isOk().expectBody().returnResult().getResponseBody(), StandardCharsets.UTF_8);
	}

	/** There is no endpoint to move an Issue by Status name, so the Status is set in the table. */
	private void move(String projectKey, int number, String statusName) {
		jdbc.sql("""
				UPDATE issues i SET status_id = (SELECT s.id FROM issue_statuses s WHERE s.project_id = i.project_id AND s.name = :status)
				WHERE i.number = :number AND i.project_id = (SELECT id FROM projects WHERE key = :key)
				""").param("status", statusName).param("key", projectKey).param("number", number).update();
	}

	private void create(Person who, String projectKey, String title) {
		client.post().uri("/api/projects/{key}/issues", projectKey).header("Authorization", "Bearer " + who.token())
			.body(Map.of("type", "Story", "title", title, "priority", "Medium")).exchange().expectStatus().isCreated();
	}

	private String project(Person owner, String name) {
		var key = "S" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
			.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + owner.token())
			.body(Map.of("key", key, "name", name)).exchange().expectStatus().isCreated();
		IssueRoles.give(jdbc, key, owner.id(), "project_admin");
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
