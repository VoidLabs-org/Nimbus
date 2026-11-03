package com.nimbus.api.issues;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

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
class CreateIssueTests {

	@Autowired
	RestTestClient client;

	@Autowired
	JdbcClient jdbc;

	record Person(String token, String id) {
	}

	@Test
	void aMemberCreatesAnIssueThatStartsInTheFirstToDoStatusWithMediumPriority() {
		var dana = register("Dana");
		var key = project(dana);

		var response = create(dana, key, Map.of("type", "Story", "title", "  Plan the sprint  "))
			.expectStatus().isCreated().expectBody()
			.jsonPath("$.key").isEqualTo(key + "-1")
			.jsonPath("$.number").isEqualTo(1)
			.jsonPath("$.type").isEqualTo("Story")
			.jsonPath("$.title").isEqualTo("Plan the sprint")
			.jsonPath("$.description").isEqualTo(null)
			.jsonPath("$.priority").isEqualTo("Medium")
			.jsonPath("$.status.name").isEqualTo("To do")
			.jsonPath("$.status.category").isEqualTo("TODO")
			.jsonPath("$.reporter.id").isEqualTo(dana.id())
			.jsonPath("$.reporter.displayName").isEqualTo("Dana")
			.jsonPath("$.assignee").isEqualTo(null)
			.jsonPath("$.version").isEqualTo(0)
			.jsonPath("$.createdAt").isNotEmpty()
			.jsonPath("$.updatedAt").isNotEmpty()
			.returnResult().getResponseBody();

		// The same Issue opens by key in any case, as created.
		var created = new String(response, StandardCharsets.UTF_8);
		client.get().uri("/api/issues/{key}", (key + "-1").toLowerCase()).header("Authorization", "Bearer " + dana.token())
			.exchange().expectStatus().isOk().expectBody()
			.jsonPath("$.id").isEqualTo(JsonPath.read(created, "$.id"))
			.jsonPath("$.key").isEqualTo(key + "-1")
			.jsonPath("$.createdAt").isEqualTo(JsonPath.read(created, "$.createdAt"));
	}

	@Test
	void theDescriptionPriorityAndAssigneeAreKept() {
		var dana = register("Dana");
		var key = project(dana);

		create(dana, key, Map.of("type", "Bug", "title", "Crash", "description", "- [ ] fix it\n\n<script>x</script>",
				"priority", "Urgent", "assigneeId", dana.id()))
			.expectStatus().isCreated().expectBody()
			.jsonPath("$.type").isEqualTo("Bug")
			.jsonPath("$.description").isEqualTo("- [ ] fix it\n\n<script>x</script>")
			.jsonPath("$.priority").isEqualTo("Urgent")
			.jsonPath("$.assignee.id").isEqualTo(dana.id())
			.jsonPath("$.assignee.displayName").isEqualTo("Dana");
	}

	@Test
	void numbersCountUpPerProjectFromOne() {
		var dana = register("Dana");
		var first = project(dana);
		var second = project(dana);

		for (int number = 1; number <= 3; number++) {
			create(dana, first, Map.of("type", "Chore", "title", "Task " + number))
				.expectStatus().isCreated().expectBody().jsonPath("$.key").isEqualTo(first + "-" + number);
		}
		create(dana, second, Map.of("type", "Chore", "title", "Other project"))
			.expectStatus().isCreated().expectBody().jsonPath("$.key").isEqualTo(second + "-1");
	}

	@Test
	void simultaneousCreatesGetDistinctNumbersAndShareOneToDoStatus() throws Exception {
		var dana = register("Dana");
		var key = project(dana);
		int count = 8;
		var start = new CountDownLatch(1);
		try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
			var attempts = java.util.stream.IntStream.range(0, count).mapToObj(i -> executor.submit(() -> {
				start.await();
				return new String(create(dana, key, Map.of("type", "Story", "title", "Race " + i))
					.expectStatus().isCreated().expectBody().returnResult().getResponseBody(), StandardCharsets.UTF_8);
			})).toList();
			start.countDown();
			var bodies = new java.util.ArrayList<String>();
			for (var attempt : attempts) bodies.add(attempt.get(30, TimeUnit.SECONDS));

			var numbers = bodies.stream().map(body -> (Integer) JsonPath.read(body, "$.number")).toList();
			assertThat(numbers).containsExactlyInAnyOrder(1, 2, 3, 4, 5, 6, 7, 8);
			var statuses = bodies.stream().map(body -> (String) JsonPath.read(body, "$.status.id")).distinct().toList();
			assertThat(statuses).hasSize(1);
		}
	}

	@Test
	void aProjectCreatedBeforeIssuesExistedGetsItsStatusesWhenFirstNeeded() {
		var dana = register("Dana");
		var key = project(dana);
		// Projects get no Statuses when they are created: nothing listens to ProjectCreated.
		assertThat(jdbc.sql("SELECT count(*) FROM issue_statuses s JOIN projects p ON p.id = s.project_id WHERE p.key = :key")
			.param("key", key).query(Long.class).single()).isZero();

		create(dana, key, Map.of("type", "Story", "title", "First")).expectStatus().isCreated();

		var categories = jdbc.sql("""
				SELECT s.name || ':' || s.category FROM issue_statuses s JOIN projects p ON p.id = s.project_id
				WHERE p.key = :key ORDER BY s.position
				""").param("key", key).query(String.class).list();
		assertThat(categories).containsExactly("To do:TODO", "In progress:IN_PROGRESS", "Done:DONE");
	}

	@Test
	void invalidFieldsGetFieldErrors() {
		var dana = register("Dana");
		var key = project(dana);
		var outsider = register("Eve");

		expectFieldError(dana, key, Map.of("type", "Epic", "title", "T"), "type");
		expectFieldError(dana, key, Map.of("title", "No type"), "type");
		expectFieldError(dana, key, Map.of("type", "Story"), "title");
		expectFieldError(dana, key, Map.of("type", "Story", "title", "   "), "title");
		expectFieldError(dana, key, Map.of("type", "Story", "title", "x".repeat(256)), "title");
		expectFieldError(dana, key, Map.of("type", "Story", "title", "bad\u0000title"), "title");
		expectFieldError(dana, key, Map.of("type", "Story", "title", "T", "description", "x".repeat(50_001)),
				"description");
		expectFieldError(dana, key, Map.of("type", "Story", "title", "T", "priority", "Critical"), "priority");
		// An Assignee must be a Member of the project.
		expectFieldError(dana, key, Map.of("type", "Story", "title", "T", "assigneeId", outsider.id()), "assigneeId");
		expectFieldError(dana, key, Map.of("type", "Story", "title", "T", "assigneeId", UUID.randomUUID().toString()),
				"assigneeId");

		// The limits themselves are fine.
		create(dana, key, Map.of("type", "Story", "title", "x".repeat(255), "description", "y".repeat(50_000)))
			.expectStatus().isCreated();
		// A refused create takes no number.
		create(dana, key, Map.of("type", "Story", "title", "Next")).expectStatus().isCreated().expectBody()
			.jsonPath("$.number").isEqualTo(2);
	}

	@Test
	void nonMembersAndUnknownProjectsAndKeysGetNotFound() {
		var dana = register("Dana");
		var key = project(dana);
		var eve = register("Eve");
		create(dana, key, Map.of("type", "Story", "title", "Secret")).expectStatus().isCreated();

		create(eve, key, Map.of("type", "Story", "title", "Sneaky")).expectStatus().isNotFound();
		create(eve, "NOSUCH", Map.of("type", "Story", "title", "Sneaky")).expectStatus().isNotFound();
		for (var issueKey : new String[] { key + "-1", key + "-99", "NOSUCH-1", "nonsense", key + "-0", key + "-99999999999" }) {
			client.get().uri("/api/issues/{key}", issueKey).header("Authorization", "Bearer " + eve.token())
				.exchange().expectStatus().isNotFound();
		}
		client.get().uri("/api/issues/{key}", key + "-99").header("Authorization", "Bearer " + dana.token())
			.exchange().expectStatus().isNotFound();
	}

	@Test
	void issuesNeedASignedInUser() {
		client.post().uri("/api/projects/ANY/issues").body(Map.of("type", "Story", "title", "T"))
			.exchange().expectStatus().isUnauthorized();
		client.get().uri("/api/issues/ANY-1").exchange().expectStatus().isUnauthorized();
	}

	@Test
	void anArchivedProjectRefusesNewIssuesButStillShowsOldOnes() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, Map.of("type", "Story", "title", "Before")).expectStatus().isCreated();
		jdbc.sql("UPDATE projects SET archived_at = now() WHERE key = :key").param("key", key).update();

		create(dana, key, Map.of("type", "Story", "title", "After")).expectStatus().isEqualTo(409);
		client.get().uri("/api/issues/{key}", key + "-1").header("Authorization", "Bearer " + dana.token())
			.exchange().expectStatus().isOk();
	}

	@Test
	void creatingWritesACreatedHistoryEntryByTheReporter() {
		var dana = register("Dana");
		var key = project(dana);
		create(dana, key, Map.of("type", "Story", "title", "History")).expectStatus().isCreated();

		var entries = jdbc.sql("""
				SELECT h.field || ':' || h.actor_id FROM issue_history h JOIN issues i ON i.id = h.issue_id
				JOIN projects p ON p.id = i.project_id WHERE p.key = :key
				""").param("key", key).query(String.class).list();
		assertThat(entries).containsExactly("created:" + dana.id());
	}

	private RestTestClient.ResponseSpec create(Person who, String projectKey, Map<String, ?> body) {
		return client.post().uri("/api/projects/{key}/issues", projectKey)
			.header("Authorization", "Bearer " + who.token()).body(body).exchange();
	}

	private void expectFieldError(Person who, String projectKey, Map<String, ?> body, String field) {
		create(who, projectKey, new HashMap<>(body)).expectStatus().isBadRequest().expectBody()
			.jsonPath("$.errors." + field).exists();
	}

	private String project(Person owner) {
		var key = "I" + ThreadLocalRandom.current().ints(7, 'A', 'Z' + 1)
			.collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append);
		client.post().uri("/api/projects").header("Authorization", "Bearer " + owner.token())
			.body(Map.of("key", key, "name", "Project " + key)).exchange().expectStatus().isCreated();
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
