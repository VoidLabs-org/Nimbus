package com.nimbus.api.issues;

import java.util.HashMap;
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
class EditIssueTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void editingTheTitleAndDescriptionWithTheCurrentVersionChangesThemAndRaisesTheVersion() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);

		patch(dana, issue, Map.of("title", "  New title  ", "description", "New *text*", "version", 0))
			.expectStatus().isOk().expectBody()
			.jsonPath("$.title").isEqualTo("New title")
			.jsonPath("$.description").isEqualTo("New *text*")
			.jsonPath("$.version").isEqualTo(1)
			.jsonPath("$.reporter.id").isEqualTo(dana.id());

		// An empty description clears it.
		patch(dana, issue, Map.of("description", "", "version", 1)).expectStatus().isOk().expectBody()
			.jsonPath("$.description").isEqualTo(null).jsonPath("$.version").isEqualTo(2);
	}

	@Test
	void aStaleVersionIsRefusedAndNothingIsOverwritten() {
		var dana = register("Dana");
		var issue = createIssue(dana, project(dana));
		patch(dana, issue, Map.of("title", "Dana's title", "version", 0)).expectStatus().isOk();

		patch(dana, issue, Map.of("title", "Overwrite", "version", 0)).expectStatus().isEqualTo(409).expectBody()
			.jsonPath("$.code").isEqualTo("issue_changed");
		patch(dana, issue, Map.of("description", "Overwrite", "version", 0)).expectStatus().isEqualTo(409);

		get(dana, issue).expectBody().jsonPath("$.title").isEqualTo("Dana's title");
		history(dana, issue).expectBody().jsonPath("$.length()").isEqualTo(2);
	}

	@Test
	void titleOrDescriptionNeedsAVersionButTypeAndPriorityDoNot() {
		var dana = register("Dana");
		var issue = createIssue(dana, project(dana));

		patch(dana, issue, Map.of("title", "No version")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.version").exists();
		patch(dana, issue, Map.of("type", "Bug", "priority", "Urgent")).expectStatus().isOk().expectBody()
			.jsonPath("$.type").isEqualTo("Bug").jsonPath("$.priority").isEqualTo("Urgent")
			.jsonPath("$.version").isEqualTo(0);
	}

	@Test
	void quickChangesNeverMakeAnOpenTextEditStale() {
		var dana = register("Dana");
		var issue = createIssue(dana, project(dana));

		patch(dana, issue, Map.of("priority", "High")).expectStatus().isOk();
		assign(dana, issue, dana.id()).expectStatus().isOk();

		patch(dana, issue, Map.of("title", "Still fine", "version", 0)).expectStatus().isOk();
	}

	@Test
	void fieldsAreValidatedLikeOnCreate() {
		var dana = register("Dana");
		var issue = createIssue(dana, project(dana));

		patch(dana, issue, Map.of("title", "   ", "version", 0)).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.title").exists();
		patch(dana, issue, Map.of("title", "x".repeat(256), "version", 0)).expectStatus().isBadRequest();
		patch(dana, issue, Map.of("type", "Epic")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.type").exists();
		patch(dana, issue, Map.of("priority", "Soon")).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors.priority").exists();
		patch(dana, issue, Map.of("description", "x".repeat(50_001), "version", 0)).expectStatus().isBadRequest();
	}

	@Test
	void theReporterCannotBeChanged() {
		var dana = register("Dana");
		var lee = register("Lee");
		var key = project(dana);
		var issue = createIssue(dana, key);

		patch(dana, issue, Map.of("reporterId", lee.id(), "priority", "Low")).expectStatus().isOk().expectBody()
			.jsonPath("$.reporter.id").isEqualTo(dana.id());
	}

	@Test
	void assigningAMemberAndUnassigningWork() {
		var dana = register("Dana");
		var issue = createIssue(dana, project(dana));

		assign(dana, issue, dana.id()).expectStatus().isOk().expectBody()
			.jsonPath("$.assignee.id").isEqualTo(dana.id());
		var cleared = new HashMap<String, Object>();
		cleared.put("userId", null);
		client.put().uri("/api/issues/{key}/assignee", issue).header("Authorization", "Bearer " + dana.token())
			.body(cleared).exchange().expectStatus().isOk().expectBody().jsonPath("$.assignee").isEqualTo(null);
	}

	@Test
	void anAssigneeWhoIsNotAMemberIsRefused() {
		var dana = register("Dana");
		var lee = register("Lee");
		var issue = createIssue(dana, project(dana));

		assign(dana, issue, lee.id()).expectStatus().isBadRequest().expectBody().jsonPath("$.errors.userId").exists();
		assign(dana, issue, UUID.randomUUID().toString()).expectStatus().isBadRequest();
	}

	@Test
	void everyChangedFieldHasOneHistoryEntryNewestFirst() throws Exception {
		var dana = register("Dana");
		var issue = createIssue(dana, project(dana));

		patch(dana, issue, Map.of("title", "Second", "type", "Bug", "version", 0)).expectStatus().isOk();
		patch(dana, issue, Map.of("description", "Words", "priority", "Low", "version", 1)).expectStatus().isOk();
		assign(dana, issue, dana.id()).expectStatus().isOk();
		// Same values again change nothing and record nothing.
		patch(dana, issue, Map.of("priority", "Low", "title", "Second", "version", 2)).expectStatus().isOk();
		assign(dana, issue, dana.id()).expectStatus().isOk();

		var body = new String(history(dana, issue).expectBody().returnResult().getResponseBody());
		org.assertj.core.api.Assertions.assertThat((Integer) JsonPath.read(body, "$.length()")).isEqualTo(6);
		org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(body, "$[0].field")).isEqualTo("assignee");
		org.assertj.core.api.Assertions.assertThat((Object) JsonPath.read(body, "$[0].before")).isNull();
		org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(body, "$[0].after")).isEqualTo("Dana");
		org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(body, "$[0].actor.displayName")).isEqualTo("Dana");
		org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(body, "$[0].at")).isNotEmpty();
		org.assertj.core.api.Assertions.assertThat((java.util.List<String>) JsonPath.read(body, "$[*].field"))
			.containsExactlyInAnyOrder("assignee", "description", "priority", "title", "type", "created");
		org.assertj.core.api.Assertions.assertThat((String) JsonPath.read(body, "$[5].field")).isEqualTo("created");
		org.assertj.core.api.Assertions.assertThat(((java.util.List<String>) JsonPath.read(body, "$[?(@.field=='title')].before")).getFirst())
			.isEqualTo("Original");
		org.assertj.core.api.Assertions.assertThat(((java.util.List<String>) JsonPath.read(body, "$[?(@.field=='title')].after")).getFirst())
			.isEqualTo("Second");
		org.assertj.core.api.Assertions.assertThat(((java.util.List<String>) JsonPath.read(body, "$[?(@.field=='description')].after")).getFirst())
			.isEqualTo("Words");
	}

	@Test
	void anArchivedProjectRefusesEveryChange() {
		var dana = register("Dana");
		var key = project(dana);
		var issue = createIssue(dana, key);
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", key).update();

		patch(dana, issue, Map.of("priority", "Low")).expectStatus().isEqualTo(409);
		assign(dana, issue, dana.id()).expectStatus().isEqualTo(409);
		get(dana, issue).expectStatus().isOk();
		history(dana, issue).expectStatus().isOk();
	}

	@Test
	void nonMembersAndUnknownKeysGetNotFoundAndAnonymousCallersGetUnauthorized() {
		var dana = register("Dana");
		var lee = register("Lee");
		var issue = createIssue(dana, project(dana));

		patch(lee, issue, Map.of("priority", "Low")).expectStatus().isNotFound();
		assign(lee, issue, lee.id()).expectStatus().isNotFound();
		history(lee, issue).expectStatus().isNotFound();
		patch(dana, "NOPE-1", Map.of("priority", "Low")).expectStatus().isNotFound();
		client.patch().uri("/api/issues/{key}", issue).body(Map.of("priority", "Low")).exchange()
			.expectStatus().isUnauthorized();
		get(dana, issue).expectBody().jsonPath("$.priority").isEqualTo("Medium");
	}

	@Test
	void twoEditsWithTheSameVersionLetOnlyOneThrough() throws Exception {
		var dana = register("Dana");
		var issue = createIssue(dana, project(dana));
		var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
		try {
			var first = pool.submit(() -> patch(dana, issue, Map.of("title", "A", "version", 0)).returnResult().getStatus().value());
			var second = pool.submit(() -> patch(dana, issue, Map.of("title", "B", "version", 0)).returnResult().getStatus().value());
			org.assertj.core.api.Assertions.assertThat(java.util.List.of(first.get(), second.get()))
				.containsExactlyInAnyOrder(200, 409);
		}
		finally {
			pool.shutdown();
		}
	}

	private RestTestClient.ResponseSpec patch(Person who, String issueKey, Map<String, ?> body) {
		return client.patch().uri("/api/issues/{key}", issueKey).header("Authorization", "Bearer " + who.token())
			.body(body).exchange();
	}

	private RestTestClient.ResponseSpec assign(Person who, String issueKey, String userId) {
		return client.put().uri("/api/issues/{key}/assignee", issueKey).header("Authorization", "Bearer " + who.token())
			.body(Map.of("userId", userId)).exchange();
	}

	private RestTestClient.ResponseSpec get(Person who, String issueKey) {
		return client.get().uri("/api/issues/{key}", issueKey).header("Authorization", "Bearer " + who.token()).exchange();
	}

	private RestTestClient.ResponseSpec history(Person who, String issueKey) {
		return client.get().uri("/api/issues/{key}/history", issueKey).header("Authorization", "Bearer " + who.token())
			.exchange();
	}

	/** Creates an Issue titled "Original" and returns its key. */
	private String createIssue(Person who, String projectKey) {
		var body = client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(Map.of("type", "Story", "title", "Original"))
			.exchange().expectStatus().isCreated().expectBody(String.class).returnResult().getResponseBody();
		return JsonPath.read(body, "$.key");
	}

	private String project(Person owner) {
		var key = "E" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
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
