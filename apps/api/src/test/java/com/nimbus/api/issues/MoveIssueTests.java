package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class MoveIssueTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Issues issues;

	record Person(String token, String id) {
	}

	@Test
	void aProjectsStatusesComeInOrderWithTheirCategories() {
		var dana = register("Dana");
		var key = project(dana);
		createIssue(dana, key);

		var body = body(client.get().uri("/api/projects/{key}/statuses", key)
			.header("Authorization", "Bearer " + dana.token()).exchange().expectStatus().isOk());
		assertThat((List<String>) JsonPath.read(body, "$[*].name")).containsExactly("To do", "In progress", "Done");
		assertThat((List<String>) JsonPath.read(body, "$[*].category")).containsExactly("TODO", "IN_PROGRESS", "DONE");
	}

	@Test
	void anIssueMovesToAnyStatusInAnyDirectionWithoutAVersion() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);

		move(dana, issue, statusId(dana, key, "Done")).expectStatus().isOk().expectBody()
			.jsonPath("$.status.name").isEqualTo("Done").jsonPath("$.status.category").isEqualTo("DONE")
			.jsonPath("$.version").isEqualTo(0);
		move(dana, issue, statusId(dana, key, "To do")).expectStatus().isOk().expectBody()
			.jsonPath("$.status.name").isEqualTo("To do");
		move(dana, issue, statusId(dana, key, "In progress")).expectStatus().isOk();

		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectBody().jsonPath("$.status.name").isEqualTo("In progress");
	}

	@Test
	void aStatusOfAnotherProjectOrAMissingOneIsRefused() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);
		var otherKey = project(dana);
		createIssue(dana, otherKey);

		move(dana, issue, statusId(dana, otherKey, "Done")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.statusId").exists();
		move(dana, issue, UUID.randomUUID().toString()).expectStatus().isBadRequest();
		client.put().uri("/api/issues/{key}/status", issue).header("Authorization", "Bearer " + dana.token())
			.body(Map.of()).exchange().expectStatus().isBadRequest().expectBody().jsonPath("$.errors.statusId").exists();

		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectBody().jsonPath("$.status.name").isEqualTo("To do");
	}

	@Test
	void aMoveIsInTheHistoryWithTheStatusFromAndTo() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);

		move(dana, issue, statusId(dana, key, "In progress")).expectStatus().isOk();
		// Moving to the Status it is already in changes nothing and records nothing.
		move(dana, issue, statusId(dana, key, "In progress")).expectStatus().isOk();

		var history = body(client.get().uri("/api/issues/{key}/history", issue)
			.header("Authorization", "Bearer " + dana.token()).exchange().expectStatus().isOk());
		assertThat((Integer) JsonPath.read(history, "$.length()")).isEqualTo(2);
		assertThat((String) JsonPath.read(history, "$[0].field")).isEqualTo("status");
		assertThat((String) JsonPath.read(history, "$[0].before")).isEqualTo("To do");
		assertThat((String) JsonPath.read(history, "$[0].after")).isEqualTo("In progress");
		assertThat((String) JsonPath.read(history, "$[0].actor.displayName")).isEqualTo("Dana");
	}

	@Test
	void anArchivedProjectRefusesMoves() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);
		var done = statusId(dana, key, "Done");
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", key).update();

		move(dana, issue, done).expectStatus().isEqualTo(409);
		client.get().uri("/api/issues/{key}", issue).header("Authorization", "Bearer " + dana.token()).exchange()
			.expectBody().jsonPath("$.status.name").isEqualTo("To do");
	}

	@Test
	void nonMembersGetNotFoundAndAnonymousCallersGetUnauthorized() {
		var dana = register("Dana");
		var lee = register("Lee");
		var key = project(dana);
		var issue = createIssue(dana, key);
		var done = statusId(dana, key, "Done");

		move(lee, issue, done).expectStatus().isNotFound();
		move(dana, "NOPE-1", done).expectStatus().isNotFound();
		client.get().uri("/api/projects/{key}/statuses", key).header("Authorization", "Bearer " + lee.token())
			.exchange().expectStatus().isNotFound();
		client.put().uri("/api/issues/{key}/status", issue).body(Map.of("statusId", done)).exchange()
			.expectStatus().isUnauthorized();
	}

	@Test
	void thePublicOperationAndTheEndpointDoTheSame() {
		var dana = register("Dana");
		var danaId = UUID.fromString(dana.id());
		var key = project(dana);
		var viaEndpoint = createIssue(dana, key);
		var viaApi = createIssue(dana, key);
		var inProgress = statusId(dana, key, "In progress");

		move(dana, viaEndpoint, inProgress).expectStatus().isOk();
		var moved = issues.changeStatus(danaId, viaApi, UUID.fromString(inProgress));

		assertThat(moved.name()).isEqualTo("In progress");
		assertThat(moved.category()).isEqualTo("IN_PROGRESS");
		assertThat(issues.statuses(projectId(key))).extracting(ProjectStatus::name)
			.containsExactly("To do", "In progress", "Done");
		for (var issue : List.of(viaEndpoint, viaApi)) {
			var history = body(client.get().uri("/api/issues/{key}/history", issue)
				.header("Authorization", "Bearer " + dana.token()).exchange().expectStatus().isOk());
			assertThat((String) JsonPath.read(history, "$[0].field")).isEqualTo("status");
			assertThat((String) JsonPath.read(history, "$[0].before")).isEqualTo("To do");
			assertThat((String) JsonPath.read(history, "$[0].after")).isEqualTo("In progress");
		}

		// Both go through the same rules: another project's Status and an archived project are refused.
		var otherKey = project(dana);
		createIssue(dana, otherKey);
		var foreign = UUID.fromString(statusId(dana, otherKey, "Done"));
		assertThatThrownBy(() -> issues.changeStatus(danaId, viaApi, foreign)).isInstanceOf(RuntimeException.class);
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", key).update();
		assertThatThrownBy(() -> issues.changeStatus(danaId, viaApi, UUID.fromString(inProgress)))
			.isInstanceOf(RuntimeException.class);
	}

	private UUID projectId(String key) {
		return jdbc.sql("SELECT id FROM projects WHERE key = :key").param("key", key).query(UUID.class).single();
	}

	private String statusId(Person who, String projectKey, String name) {
		var statuses = body(client.get().uri("/api/projects/{key}/statuses", projectKey)
			.header("Authorization", "Bearer " + who.token()).exchange().expectStatus().isOk());
		return ((List<String>) JsonPath.read(statuses, "$[?(@.name=='" + name + "')].id")).getFirst();
	}

	private RestTestClient.ResponseSpec move(Person who, String issueKey, String statusId) {
		return client.put().uri("/api/issues/{key}/status", issueKey).header("Authorization", "Bearer " + who.token())
			.body(Map.of("statusId", statusId)).exchange();
	}

	private static String body(RestTestClient.ResponseSpec spec) {
		return new String(spec.expectBody().returnResult().getResponseBody());
	}

	private String createIssue(Person who, String projectKey) {
		var body = client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("type", "Story", "title", "Original"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.key");
	}

	private String project(Person owner) {
		var key = "M" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
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
